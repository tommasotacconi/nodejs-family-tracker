import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "njs_user",
  host: "195.201.130.186",
  database: "world",
  password: "#remote-njsdb",
  port: 5432,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let currentUserId = null;

let users = [];

async function checkVisited(id) {
  const result = await db.query("SELECT users.id, full_name, color, c.country_name, c.country_code FROM users LEFT JOIN visited_countries vc ON user_id = users.id LEFT JOIN countries c ON vc.country_id = c.id WHERE users.id = COALESCE($1, (SELECT id FROM users ORDER BY id LIMIT 1));", [id]);

	if (!currentUserId) currentUserId = result.rows[0].id;
	console.log('Function \'checkVisited()\' result: ', result.rows);
  let countries = [];
  result.rows.forEach(country => {
    if (country.country_code) countries.push(country.country_code);
  });
	const { rows: [{ color }] } = result;
  return [countries, color];
}

function passIndexData([userCountries, userColor], error = null) {
	return {
		countries: userCountries,
		total: userCountries.length,
		users,
		color: userColor,
		error
	};
}

app.get("/", async (req, res) => {
  const userCountriesAndColor = await checkVisited(currentUserId);
	const { rows: usersData } = await db.query('SELECT id, full_name as name, color FROM users');
	users = usersData;
  res.render("index.ejs", passIndexData(userCountriesAndColor));
});

app.post("/add", async (req, res) => {
  const input = req.body["country"];

  try {
		// Retrieve 'id' from 'countries'
    const { rows: [{ id: countryId, country_code: countryCode }] } = await db.query(
      "SELECT id, country_code FROM countries WHERE LOWER(country_name) LIKE '%' || $1 || '%';",
      [input.toLowerCase()]
    );
		console.log(`Requested to add country_code ${countryCode} with id ${countryId}`);

		try {
			// Insert user country record in bridge table 'visited_countries' between 'users' and 'countries'
			await db.query(
				"INSERT INTO visited_countries (user_id, country_id) VALUES ($1, $2)",
				[currentUserId, countryId]
			)
			console.log('Inserted user_id and country_id in visited_countries table')
			res.redirect("/");
		} catch (err) {
			/* Failed insertion in bridge table visited_countries */
			console.log(err);
			// Warn user the country is already present
			const userCountriesAndColor = await checkVisited(currentUserId);
			const errMsg = 'Country already present';
			res.render("index.ejs", passIndexData(userCountriesAndColor, errMsg));
		}
  } catch (err) {
		/* Failed country_code research */
    console.log(err);
		// Warn user no matching country is found
		const userCountriesAndColor = await checkVisited(currentUserId);
		const errMsg = 'Cannot find a matching world country, please check the spelling for your country'
		res.render('index.ejs', passIndexData(userCountriesAndColor, errMsg));
	}
});

app.post("/user", async (req, res) => {
	const { user: id } = req.body;
	console.log(id);
	if (id !== undefined) {
		currentUserId = id;
		res.redirect('/');
	} else {
		res.render("new.ejs");
	}
});

app.post("/new", async (req, res) => {
  //Hint: The RETURNING keyword can return the data that was inserted.
  //https://www.postgresql.org/docs/current/dml-returning.html
	const { name, color } = (req.body);
	const { rows: [{ id: userId }] } = await db.query(
		"INSERT INTO users (full_name, color) VALUES ($1, $2) RETURNING id",
		[name, color]
	);
	currentUserId = userId;
	res.redirect('/');
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

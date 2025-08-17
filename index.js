import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "njs_user",
  host: "localhost",
  database: "world",
  password: "#remote-njsdb",
  port: 5432,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let currentUserId = null;

let users = [];

async function checkVisisted(id) {
  const result = await db.query("SELECT full_name, color, c.country_name, c.country_code FROM users LEFT JOIN user_country ON users.id = user_id LEFT JOIN visited_countries vc ON user_country.country_id = vc.id LEFT JOIN countries c ON vc.country_code = c.country_code WHERE users.id = COALESCE($1, (SELECT id FROM users ORDER BY id LIMIT 1));", [id]);
	console.log('Fuction "checkVisited() result: ', result.rows);
  let countries = [];
  result.rows.forEach(country => {
    if (country.country_code) countries.push(country.country_code);
  });
	const { rows: [{ color }] } = result;
  return [countries, color];
}

app.get("/", async (req, res) => {
  const countriesAndColor = await checkVisisted(currentUserId);
	const { rows: usersData } = await db.query('SELECT id, full_name as name, color FROM users');
	users = usersData;
  res.render("index.ejs", {
    countries: countriesAndColor[0],
    total: countriesAndColor[0].length,
    users,
    color: countriesAndColor[1],
  });
});

app.post("/add", async (req, res) => {
  const input = req.body["country"];

  try {
		// Retrieve 'country_code' from table 'countries'
    const result = await db.query(
      "SELECT id, country_code FROM countries WHERE LOWER(country_name) LIKE '%' || $1 || '%';",
      [input.toLowerCase()]
    );

    const data = result.rows[0];
		console.log(data);
    const countryCode = data.country_code;
    try {
			// Retrieve 'country_id' from table 'visited_countries'
      const { rows: [{ id: countryId }] } = await db.query(
        "SELECT id FROM visited_countries WHERE country_code = $1;",
        [countryCode]
      );
			console.log("Found country_id in table visited_countries related to country_code: '" + countryCode + "'");
			try {
				// Insert user country record in bridge table 'user_country' between 'users' and 'visited_countries'
				await db.query(
					"INSERT INTO user_country (user_id, country_id) VALUES ($1, $2)",
					[currentUserId, countryId]
				)
				console.log('Inserted user_id and country_id in user_country table')
				res.redirect("/");
			} catch (err) {
				console.log(err);

				const countriesAndColor = await checkVisisted(currentUserId);
				res.render("index.ejs", {
					countries: countriesAndColor[0],
					total: countriesAndColor[0].length,
					users: users,
					color: countriesAndColor[1],
					error: 'Country already present'
				});
			}
    } catch (err) {
      console.log(err);
			const { rows: [{ id: countryId }] } = await db.query("INSERT INTO visited_countries (country_code) VALUES ($1) RETURNING id;", [countryCode]);
			await db.query(
				"INSERT INTO user_country (user_id, country_id) VALUES ($1, $2)",
				[currentUserId, countryId]
			)
			console.log('Not found country_code in table visited_countries. Inserted country_code first, retrieved id and then insert new user-country relation in user_country')
 
			const countriesAndColor = await checkVisisted(currentUserId);
			res.render('index.ejs', {
				countries: countriesAndColor[0],
				total: countriesAndColor[0].length,
				users: users,
				color: countriesAndColor[1],
			})
    }
  } catch (err) {
    console.log(err);

		const countriesAndColor = await checkVisisted(currentUserId);
		res.render('index.ejs', {
			countries: countriesAndColor[0],
			total: countriesAndColor[0].length,
			users: users,
			color: countriesAndColor[1],
			error: 'Cannot find a matching world countries, please check the spelling for your country'
		})
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

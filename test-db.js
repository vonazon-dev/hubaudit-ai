const { Client } = require("pg");

const client = new Client({
    connectionString:
        "postgresql://user:password@localhost:5433/hubaudit",
});

async function test() {
    try {
        await client.connect();
        console.log("CONNECTED SUCCESSFULLY");

        const res = await client.query("SELECT NOW()");
        console.log(res.rows);

        await client.end();
    } catch (err) {
        console.error(err);
    }
}

test();
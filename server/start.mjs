import pg from 'pg';
import {initialize,PostgresStore} from './store.mjs';
import {configure,createApplication} from './application.mjs';
pg.types.setTypeParser(20,Number);
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required. Configure a PostgreSQL connection in Render Environment.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:15000,idleTimeoutMillis:30000});
await initialize(pool);configure(process.env,new PostgresStore(pool));
const app=createApplication({databasePool:pool});const port=Number(process.env.PORT||10000);
const server=app.listen(port,'0.0.0.0',()=>console.log('RemDec Judge Call listening on port '+port));
async function shutdown(){server.close(async()=>{await pool.end();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);

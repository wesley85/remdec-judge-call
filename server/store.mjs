import fs from 'node:fs/promises';
export class PostgresStore {
 constructor(database){this.database=database}
 prepare(source){
  let sql=source.replace(/\b(events|calls|login_attempts)\b/g,t=>'judging_'+t);
  const ignore=/^INSERT OR IGNORE INTO/i.test(sql);sql=sql.replace(/^INSERT OR IGNORE INTO/i,'INSERT INTO');
  let n=0;sql=sql.replace(/\?/g,()=>'$'+(++n));
  if(ignore)sql+=' ON CONFLICT DO NOTHING';
  const database=this.database;
  return {bind(...args){return {
   async first(){const r=await database.query(sql,args);return normalize(r.rows[0])||null},
   async all(){const r=await database.query(sql,args);return {results:r.rows.map(normalize)}},
   async run(){const r=await database.query(sql,args);return {meta:{changes:r.rowCount??r.affectedRows??0}}}
  }}};
 }
}
function normalize(row){if(!row)return row;const out={...row};for(const key of ['created','updated','timer_remaining','timer_ends','timer_updated','stamp','serverNow','expires'])if(out[key]!==null&&out[key]!==undefined)out[key]=Number(out[key]);return out}
export async function initialize(database){
 const sql=await fs.readFile(new URL('./schema.sql',import.meta.url),'utf8');
 // The schema only creates judging_* tables. It never edits scheduler tables.
 for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean))await database.query(statement);
}

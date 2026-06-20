require('dotenv').config();
const mysql=require('mysql2/promise');
(async()=>{const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:+(process.env.DB_PORT||3306),user:process.env.DB_USERNAME||'root',password:process.env.DB_PASSWORD||'',multipleStatements:true});
await c.query('DROP DATABASE IF EXISTS sigma_guide; CREATE DATABASE sigma_guide;');console.log('created sigma_guide');await c.end();})().catch(e=>{console.error(e.message);process.exit(1)});

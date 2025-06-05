const mysql = require('mysql2/promise');

async function test() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'TVU@842004',
    database: 'QuanLyNhaHang'
  });
  
  const [rows] = await conn.query('SELECT 1 + 1 AS solution');
  console.log('Kết quả:', rows[0].solution);
  conn.end();
}

test().catch(console.error);
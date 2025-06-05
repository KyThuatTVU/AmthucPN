require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql2/promise');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://127.0.0.1:5501', 'http://localhost:5501'],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
}));
app.use(express.json());
app.use((req,res,next) => {
  console.log(`${req.method} ${req.url}`, req.body);
  next();
});

// — Ảnh tĩnh —
const imagesPath = path.join(__dirname,'images');
app.use('/images', express.static(imagesPath, {
  setHeaders: res => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
  }
}));

// — Upload ảnh —
const storage = multer.diskStorage({
  destination: (req,file,cb) => cb(null,imagesPath),
  filename: (req,file,cb) => cb(null,`${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });
app.post('/api/upload-image', upload.single('image'), (req,res) => {
  if(!req.file) return res.status(400).json({ error: 'Chưa có file được gửi lên' });
  res.json({ filename: req.file.filename });
});

// — Khởi tạo pool 1 lần duy nhất —
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'TVU@842004',
  database: process.env.DB_NAME || 'QuanLyNhaHang',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    console.log('✅ Kết nối database thành công ngay lần đầu');
  } catch (err) {
    console.error('❌ Lỗi kết nối database:', err);
    process.exit(1);
  }
})();

// — Các route sử dụng pool —
function buildImageUrl(req, filename) {
  return filename
    ? `${req.protocol}://${req.get('host')}/images/${filename}`
    : null;
}

app.get('/api/mon_an', async (req,res) => {
  const search = req.query.search || '';
  let connection;
  try {
    connection = await pool.getConnection();
    const query = `
      SELECT id_mon, id_loai, ten_mon, mo_ta, gia, hinh_anh, so_luong 
      FROM mon_an 
      WHERE ten_mon LIKE ? OR mo_ta LIKE ?
    `;
    const params = [`%${search}%`, `%${search}%`];
    const [rows] = await connection.execute(query, params);
    connection.release();
    const result = rows.map(item => ({
      ...item,
      hinh_anh: buildImageUrl(req, item.hinh_anh)
    }));
    res.json(result);
  } catch(err) {
    if(connection) connection.release();
    console.error('API /api/mon_an Error:', err);
    res.status(500).json({ error: 'Lỗi server', message: err.message });
  }
});

// —————————————————————————————————————————————
// 4. Cấu hình MySQL
// —————————————————————————————————————————————
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'TVU@842004',
  database: process.env.DB_NAME || 'QuanLyNhaHang'
};

// Hàm kết nối và trả về pool MySQL
async function connectDB() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'TVU@842004',
    database: process.env.DB_NAME || 'QuanLyNhaHang',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Test connection immediately
  try {
    const testConn = await pool.getConnection();
    await testConn.query('SELECT 1');
    testConn.release();
    console.log('✅ Kết nối database thành công');
  } catch (err) {
    console.error('❌ Lỗi kết nối database:', err);
    throw err; // Throw error to prevent server start
  }

  return pool;
}

// Hàm test kết nối database
async function testDBConnection() {
  try {
    const pool = await connectDB();
    const connection = await pool.getConnection();
    console.log('✅ Kết nối database thành công!');
    connection.release();
  } catch (err) {
    console.error('❌ Lỗi kết nối database:', err);
  }
}

testDBConnection();

// —————————————————————————————————————————————
// 5. API Món ăn
// —————————————————————————————————————————————

// Helper trả URL ảnh dựa vào filename
function buildImageUrl(req, filename) {
  return filename
    ? `${req.protocol}://${req.get('host')}/images/${filename}`
    : null;
}

// GET /api/mon_an?search=
app.get('/api/mon_an', async (req, res) => {
  const search = req.query.search || '';
  console.log(`[API] Tìm kiếm món ăn: ${search}`);
  
  let connection;
  try {
    const pool = await connectDB();
    connection = await pool.getConnection();
    
    // Test kết nối đơn giản
    await connection.query("SELECT 1");
    
    const query = `
      SELECT id_mon, id_loai, ten_mon, mo_ta, gia, hinh_anh, so_luong 
      FROM mon_an 
      WHERE ten_mon LIKE ? OR mo_ta LIKE ?
    `;
    const params = [`%${search}%`, `%${search}%`];
    
    console.log("Executing query:", query);
    console.log("With params:", params);
    
    const [rows] = await connection.execute(query, params);
    
    console.log(`[API] Tìm thấy ${rows.length} món`);
    connection.release();
    
    const result = rows.map(item => ({
      ...item,
      hinh_anh: buildImageUrl(req, item.hinh_anh)
    }));
    
    res.json(result);
  } catch (err) {
    if (connection) connection.release();
    console.error('API /api/mon_an Error:', err);
    
    res.status(500).json({ 
      error: 'Lỗi server', 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// GET /api/mon_an/:id
app.get('/api/mon_an/:id', async (req, res) => {
  let connection;
  try {
    const pool = await connectDB();
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT id_mon, id_loai, ten_mon, mo_ta, gia, hinh_anh, so_luong FROM mon_an WHERE id_mon = ?`,
      [req.params.id]
    );
    connection.release();
    if (!rows.length) {
      return res.status(404).json({ error: 'Không tìm thấy món' });
    }
    const item = rows[0];
    res.json({
      ...item,
      hinh_anh: buildImageUrl(req, item.hinh_anh)
    });
  } catch (err) {
    if (connection) connection.release();
    console.error('API /api/mon_an/:id Error:', err);
    res.status(500).json({ error: 'Lỗi khi tải chi tiết món ăn' });
  }
});

// —————————————————————————————————————————————
// 6. API Đăng ký & Đăng nhập
// —————————————————————————————————————————————
// Support both underscore and no-underscore versions for register
app.post(['/api/khach_hang/register', '/api/khachhang/register'], async (req, res) => {
  let pool;
  try {
    console.log('Registration request received:', { ...req.body, password: '[HIDDEN]' });
    
    pool = await connectDB();
    const { full_name, email, phone, password } = req.body;

    // Validation
    if (!full_name || !email || !phone || !password) {
      console.log('Missing required fields');
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin.' });
    }

    // Check existing email
    const [existingUsers] = await pool.execute('SELECT id FROM khach_hang WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      console.log('Email already exists:', email);
      return res.status(400).json({ error: 'Email đã được đăng ký.' });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await pool.execute(
      'INSERT INTO khach_hang (full_name, email, phone, password) VALUES (?, ?, ?, ?)',
      [full_name, email, phone, hash]
    );

    console.log('Registration successful:', { id: result.insertId, email });
    
    res.status(201).json({ 
      message: 'Đăng ký thành công!',
      user: { id: result.insertId, full_name, email, phone }
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
  }
});

app.post(['/api/khach_hang/login', '/api/khachhang/login'], async (req, res) => {
  let connection;
  try {
    const { email, password } = req.body;
    console.log('Login attempt for:', email);

    // Input validation
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu.' });
    }

    // Get database connection
    const pool = await connectDB();
    connection = await pool.getConnection();
    console.log('Database connection established');

    // Get user with proper error handling
    const [rows] = await connection.execute(
      'SELECT * FROM khach_hang WHERE email = ?', 
      [email.trim()]
    );

    if (rows.length === 0) {
      console.log('User not found:', email);
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      console.log('Invalid password for:', email);
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
    }

    // Remove password from response
    const { password: _, ...userData } = user;
    console.log('Login successful for:', email);

    res.json({
      message: 'Đăng nhập thành công!',
      khach_hang: userData
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
  } finally {
    if (connection) {
      try {
        await connection.release();
        console.log('Database connection released');
      } catch (releaseErr) {
        console.error('Error releasing connection:', releaseErr);
      }
    }
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
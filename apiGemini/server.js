require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://127.0.0.1:5501', 'http://localhost:5501'], // Add other client ports if needed
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'], // Added Authorization header
  credentials: true
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`, req.body);
  next();
});

// —————————————————————————————————————————————
// 2. Phục vụ ảnh tĩnh từ thư mục 'images'
// —————————————————————————————————————————————
const imagesPath = path.join(__dirname, 'images');
// Chỉ dùng express.static để phục vụ file, không fallback
app.use('/images', express.static(imagesPath, {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// —————————————————————————————————————————————
// 3. Upload ảnh: Multer + DiskStorage
// —————————————————————————————————————————————
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imagesPath),
  filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

app.post('/api/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Chưa có file được gửi lên' });
  }
  // Trả về tên file, frontend sẽ dùng /images/:filename
  res.json({ filename: req.file.filename });
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
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  return pool;
}

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
  let pool;
  try {
    pool = await connectDB();
    const { search } = req.query;
    let sql = `SELECT id_mon, id_loai, ten_mon, mo_ta, gia, hinh_anh, so_luong FROM mon_an WHERE 1=1`;
    const params = [];
    if (search) {
      sql += ` AND (ten_mon LIKE ? OR mo_ta LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.execute(sql, params);
    const data = rows.map(item => ({
      ...item,
      hinh_anh: buildImageUrl(req, item.hinh_anh)
    }));
    res.json(data);
  } catch (err) {
    console.error('API /api/mon_an Error:', err);
    res.status(500).json({ error: 'Lỗi khi tải danh sách món ăn' });
  }
});

// GET /api/mon_an/:id
app.get('/api/mon_an/:id', async (req, res) => {
  let pool;
  try {
    pool = await connectDB();
    const [rows] = await pool.execute(
      `SELECT id_mon, id_loai, ten_mon, mo_ta, gia, hinh_anh, so_luong FROM mon_an WHERE id_mon = ?`,
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Không tìm thấy món' });
    }
    const item = rows[0];
    res.json({
      ...item,
      hinh_anh: buildImageUrl(req, item.hinh_anh)
    });
  } catch (err) {
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

// —————————————————————————————————————————————
// 7. API Đặt Hàng (Hóa Đơn)
// —————————————————————————————————————————————
app.post('/api/orders', async (req, res) => {
  const { id_khach, loai_don, tong_tien, items, dia_chi_giao_hang, ghi_chu } = req.body;

  if (!id_khach || !loai_don || tong_tien == null || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Dữ liệu đơn hàng không hợp lệ.' });
  }
  if (loai_don === 'giao_hang' && !dia_chi_giao_hang) {
    return res.status(400).json({ error: 'Vui lòng cung cấp địa chỉ giao hàng.' });
  }

  let connection;
  try {
    const pool = await connectDB();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Bước 1: Kiểm tra tồn kho và tính tổng tiền lại từ server-side để đảm bảo
    let calculated_tong_tien = 0;
    for (const item of items) {
      if (!item.id_mon || !item.so_luong || item.so_luong <= 0 || item.gia_luc_dat == null) {
        throw new Error('Dữ liệu món ăn trong đơn hàng không hợp lệ.');
      }
      const [monAnRows] = await connection.execute('SELECT ten_mon, gia, so_luong FROM mon_an WHERE id_mon = ? FOR UPDATE', [item.id_mon]);
      if (monAnRows.length === 0) {
        throw new Error(`Món ăn với ID ${item.id_mon} không tồn tại.`);
      }
      const monAn = monAnRows[0];
      if (monAn.so_luong < item.so_luong) {
        throw new Error(`Món "${monAn.ten_mon}" không đủ số lượng tồn kho (còn ${monAn.so_luong}, cần ${item.so_luong}).`);
      }
      // Dùng giá từ DB nếu muốn an toàn hơn, hoặc tin tưởng giá_luc_dat từ client
      // calculated_tong_tien += monAn.gia * item.so_luong; // Hoặc dùng item.gia_luc_dat
      calculated_tong_tien += item.gia_luc_dat * item.so_luong;
    }
    
    // So sánh tổng tiền client gửi và server tính, có thể cho phép sai số nhỏ
    if (Math.abs(calculated_tong_tien - tong_tien) > 0.01) { // 0.01 là sai số cho phép (ví dụ)
        console.warn(`Tổng tiền client (${tong_tien}) khác tổng tiền server (${calculated_tong_tien}). Sử dụng tổng tiền server.`);
        // Có thể quyết định throw error hoặc dùng giá server
        // throw new Error('Tổng tiền không khớp. Vui lòng thử lại.');
    }


    // Bước 2: Insert vào bảng hoa_don
    // Cần đảm bảo cột dia_chi_giao_hang và ghi_chu tồn tại trong bảng hoa_don
    const hoaDonSql = `
      INSERT INTO hoa_don (id_khach, loai_don, tong_tien, trang_thai, dia_chi_giao_hang, ghi_chu) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [hoaDonResult] = await connection.execute(hoaDonSql, [
      id_khach,
      loai_don,
      calculated_tong_tien, // Sử dụng tổng tiền đã tính lại/xác minh
      'cho_xac_nhan', // trạng thái mặc định
      loai_don === 'giao_hang' ? dia_chi_giao_hang : null,
      ghi_chu || null
    ]);
    const id_hoa_don = hoaDonResult.insertId;

    // Bước 3: Insert vào bảng chi_tiet_hoa_don và cập nhật số lượng mon_an
    const chiTietSql = `
      INSERT INTO chi_tiet_hoa_don (id_hoa_don, id_mon, so_luong, gia_luc_dat, thanh_tien) 
      VALUES (?, ?, ?, ?, ?)
    `;
    const updateMonAnSql = `UPDATE mon_an SET so_luong = so_luong - ? WHERE id_mon = ?`;

    for (const item of items) {
      const thanh_tien_item = item.gia_luc_dat * item.so_luong;
      await connection.execute(chiTietSql, [
        id_hoa_don,
        item.id_mon,
        item.so_luong,
        item.gia_luc_dat,
        thanh_tien_item
      ]);
      await connection.execute(updateMonAnSql, [item.so_luong, item.id_mon]);
    }

    await connection.commit();
    res.status(201).json({ message: 'Đặt hàng thành công!', id_hoa_don: id_hoa_don });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Lỗi khi đặt hàng:', error);
    res.status(500).json({ error: error.message || 'Lỗi máy chủ khi xử lý đơn hàng.' });
  } finally {
    if (connection) connection.release();
  }
});

// Khởi tạo Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    
    // Chuyển đổi lịch sử chat sang định dạng Gemini
    const history = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Khởi tạo model
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      systemInstruction: "Bạn là trợ lý ảo cho nhà hàng ẩm thực Phú Nhuận, trả lời ngắn gọn, thân thiện."
    });

    // Bắt đầu chat
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(messages[messages.length - 1].content);
    const response = await result.response;
    const text = response.text();

    res.json({
      message: text
    });

  } catch (error) {
    console.error('Lỗi API:', error);
    res.status(500).json({ error: 'Lỗi xử lý yêu cầu' });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
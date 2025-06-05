const { exec } = require('child_process');

exec('net start mysql', (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Lỗi kiểm tra MySQL service:');
    console.error(error.message);
    return;
  }
  
  if (stdout.includes('running')) {
    console.log('✅ MySQL service đang chạy');
  } else {
    console.log('❌ MySQL service không chạy');
    console.log(stdout);
  }
});

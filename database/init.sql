CREATE DATABASE IF NOT EXISTS smart_bus CHARACTER SET utf8mb4;
USE smart_bus;

CREATE TABLE buses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plate VARCHAR(20) NOT NULL,
  model VARCHAR(50),
  capacity INT DEFAULT 50,
  status ENUM('active','inactive','maintenance') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE drivers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  phone VARCHAR(20),
  license VARCHAR(30),
  bus_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bus_id) REFERENCES buses(id)
);

CREATE TABLE routes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  stops JSON,
  bus_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bus_id) REFERENCES buses(id)
);

CREATE TABLE students (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  grade VARCHAR(20),
  parent_phone VARCHAR(20),
  face_id VARCHAR(100),
  route_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ride_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  bus_id INT NOT NULL,
  board_time DATETIME,
  alight_time DATETIME,
  board_stop VARCHAR(100),
  alight_stop VARCHAR(100),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (bus_id) REFERENCES buses(id)
);

CREATE TABLE bus_locations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  bus_id INT NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  speed DECIMAL(5,2) DEFAULT 0,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bus_id) REFERENCES buses(id)
);

CREATE TABLE notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT,
  type ENUM('board','alight','alert') NOT NULL,
  content TEXT,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_read TINYINT DEFAULT 0,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','operator') DEFAULT 'operator'
);

-- 默认管理员账号 admin/password
INSERT INTO users (username, password, role) VALUES
('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

INSERT INTO buses (plate, model, capacity, status) VALUES
('京A12345', '宇通ZK6119', 55, 'active'),
('京B67890', '金龙XMQ6127', 50, 'active'),
('京C11111', '申龙SLK6129', 48, 'maintenance');

INSERT INTO drivers (name, phone, license, bus_id) VALUES
('张伟', '13800138001', 'A12345678', 1),
('李明', '13800138002', 'A87654321', 2);

INSERT INTO routes (name, stops, bus_id) VALUES
('路线A-北区', '[{"name":"学校","lat":39.9042,"lng":116.4074},{"name":"北苑站","lat":39.9200,"lng":116.4100},{"name":"天通苑","lat":39.9500,"lng":116.4200}]', 1),
('路线B-南区', '[{"name":"学校","lat":39.9042,"lng":116.4074},{"name":"宣武门","lat":39.8900,"lng":116.3900},{"name":"大兴站","lat":39.7267,"lng":116.3400}]', 2);

INSERT INTO students (name, grade, parent_phone, face_id, route_id) VALUES
('王小明', '三年级', '13900139001', 'face_001', 1),
('李小红', '四年级', '13900139002', 'face_002', 1),
('张小华', '二年级', '13900139003', 'face_003', 2),
('刘小强', '五年级', '13900139004', 'face_004', 2);

INSERT INTO ride_records (student_id, bus_id, board_time, alight_time, board_stop, alight_stop) VALUES
(1, 1, '2026-04-30 07:30:00', '2026-04-30 08:00:00', '天通苑', '学校'),
(2, 1, '2026-04-30 07:32:00', '2026-04-30 08:00:00', '北苑站', '学校'),
(3, 2, '2026-04-30 07:25:00', '2026-04-30 08:05:00', '大兴站', '学校'),
(4, 2, '2026-04-30 07:28:00', '2026-04-30 08:05:00', '宣武门', '学校');

INSERT INTO notifications (student_id, type, content, is_read) VALUES
(1, 'board', '王小明已于07:30在天通苑上车', 0),
(2, 'board', '李小红已于07:32在北苑站上车', 0),
(3, 'board', '张小华已于07:25在大兴站上车', 1),
(1, 'alight', '王小明已于08:00在学校下车', 1);

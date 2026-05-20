ALTER TABLE users ADD COLUMN department TEXT;

UPDATE users
SET department = CASE role
  WHEN 'system_admin' THEN '系统管理员'
  WHEN 'sales_manager' THEN '销售部'
  WHEN 'lab_engineer' THEN '测试部'
  WHEN 'warehouse_manager' THEN '生产部主管'
  ELSE '研发部'
END
WHERE department IS NULL OR department = '';


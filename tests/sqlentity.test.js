// AI Accept 2026-10-17 main v1
// SQL 建表转 C# 实体：解析、类型映射、注释来源、命名与特性。期望值均按 SQL Server / MySQL 文档与 C# 约定手写。
module.exports = function (t, Tools) {
  var L = Tools.lib;

  function table(sql) { return L.sqlParseCreateTable(sql)[0]; }
  function col(tb, name) {
    for (var i = 0; i < tb.columns.length; i++) if (tb.columns[i].name === name) return tb.columns[i];
    return null;
  }
  function code(sql, opts) { return L.sqlToCSharp(sql, opts).code; }
  function has(s, frag) { return s.indexOf(frag) >= 0; }

  // ---------- 表名与架构 ----------
  var t1 = table('CREATE TABLE [dbo].[T_User] ([Id] int NOT NULL)');
  t.equal(t1.name, 'T_User', '表名：[dbo].[T_User] 去方括号');
  t.equal(t1.schema, 'dbo', '架构：dbo');
  t.equal(table('CREATE TABLE sales.orders (id int)').schema, 'sales', '架构：schema.table');
  t.equal(table('CREATE TABLE `tb_user` (`id` int)').name, 'tb_user', '表名：反引号');
  t.equal(table('CREATE TABLE IF NOT EXISTS `a` (`id` int)').name, 'a', 'MySQL：IF NOT EXISTS');
  t.equal(table('create table "Order" ("Id" int)').name, 'Order', '表名：双引号且大小写不敏感关键字');
  t.equal(table('CREATE TABLE [a]]b] ([x] int)').name, 'a]b', '方括号内 ]] 转义');

  // ---------- 列定义 ----------
  var t2 = table([
    'CREATE TABLE [dbo].[T_Order] (',
    '  [Id] [bigint] IDENTITY(1,1) NOT NULL,',
    '  [No] [nvarchar](32) NOT NULL,',
    '  [Remark] [nvarchar](max) NULL,',
    '  [Amount] [decimal](18, 2) NOT NULL CONSTRAINT [DF_Order_Amount] DEFAULT ((0)),',
    "  [Tags] nvarchar(100) NOT NULL DEFAULT (N'a,b'),",
    '  [CreatedAt] datetime NOT NULL DEFAULT (getdate()),',
    '  [Note] varchar(20) DEFAULT NULL,',
    '  [Flag] bit,',
    '  CONSTRAINT [PK_T_Order] PRIMARY KEY CLUSTERED ([Id] ASC),',
    '  CONSTRAINT [FK_x] FOREIGN KEY ([No]) REFERENCES [dbo].[T_X] ([No]),',
    '  CHECK ([Amount] >= 0)',
    ') ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]'
  ].join('\n'));
  t.equal(t2.columns.length, 8, '列数：表级约束不计为列（含 DEFAULT 中的逗号与括号）');
  t.equal(col(t2, 'Id').sqlType, 'bigint', '类型：[bigint] 去方括号');
  t.ok(col(t2, 'Id').identity && col(t2, 'Id').pk && !col(t2, 'Id').nullable, 'IDENTITY + 表级主键 → 非空');
  t.equal(col(t2, 'No').length, 32, '长度：nvarchar(32)');
  t.equal(col(t2, 'Remark').length, 'max', '长度：nvarchar(max)');
  t.ok(col(t2, 'Remark').nullable, '显式 NULL → 可空');
  t.equal(col(t2, 'Amount').length, 18, '精度：decimal(18, 2) 精度');
  t.equal(col(t2, 'Amount').scale, 2, '精度：decimal(18, 2) 小数位');
  t.ok(!col(t2, 'Amount').nullable && col(t2, 'Amount').hasDefault, '列级 CONSTRAINT … DEFAULT 不影响 NOT NULL');
  t.ok(!col(t2, 'Tags').nullable, "DEFAULT (N'a,b') 中的逗号不拆列");
  t.ok(col(t2, 'CreatedAt').hasDefault && !col(t2, 'CreatedAt').nullable, 'DEFAULT (getdate())');
  t.ok(col(t2, 'Note').nullable, 'DEFAULT NULL 不被当作 NOT NULL，也不误判');
  t.ok(col(t2, 'Flag').nullable, '未声明 NULL / NOT NULL → 可空（SQL 默认）');
  t.ok(!col(t2, 'No').pk, '外键列不是主键');

  // 复合主键与列级主键
  var t3 = table('CREATE TABLE t (a int, b int, c int PRIMARY KEY, PRIMARY KEY (a, b))');
  t.ok(col(t3, 'a').pk && col(t3, 'b').pk && col(t3, 'c').pk, '复合主键 + 列级主键');
  t.ok(!col(t3, 'a').nullable, '主键列非空');
  var t3b = table('CREATE TABLE t (`a` varchar(255), PRIMARY KEY (`a`(10)))');
  t.ok(col(t3b, 'a').pk, 'MySQL 前缀长度主键 (`a`(10))');

  // ---------- 多表、GO、语句分隔 ----------
  var multi = L.sqlParseCreateTable('CREATE TABLE a (x int)\nGO\nCREATE TABLE b (y int);\nCREATE TABLE c (z int) ENGINE=InnoDB;');
  t.deepEqual(multi.map(function (x) { return x.name; }), ['a', 'b', 'c'], '多表：GO 与分号分隔');
  t.throws(function () { L.sqlParseCreateTable('SELECT 1'); }, /未找到 CREATE TABLE/, '无建表语句时友好报错');
  t.throws(function () { L.sqlParseCreateTable("CREATE TABLE a (x varchar(10) DEFAULT 'abc)"); }, /未闭合/, '字符串未闭合报错');

  // ---------- 注释来源 ----------
  var my = table([
    'CREATE TABLE `tb_user` (',
    "  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',",
    "  `name` varchar(50) NOT NULL COMMENT '用户''名',",
    "  `bio` text COMMENT='简介'",
    ") ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COMMENT='用户表';"
  ].join('\n'));
  t.equal(col(my, 'id').comment, '主键', 'MySQL：列 COMMENT');
  t.equal(col(my, 'name').comment, "用户'名", "MySQL：COMMENT 中 '' 转义");
  t.equal(col(my, 'bio').comment, '简介', 'MySQL：COMMENT= 形式');
  t.equal(my.comment, '用户表', 'MySQL：表 COMMENT=（CHARACTER SET 之后）');
  t.ok(col(my, 'id').identity, 'MySQL：AUTO_INCREMENT');
  t.equal(my.dialect, 'mysql', '方言识别：反引号 / ENGINE → mysql');

  var ss = [
    'CREATE TABLE [dbo].[T_User] (',
    '  [Id] int NOT NULL,',
    '  [UserName] nvarchar(50) NOT NULL,',
    '  [Age] int NULL',
    ')',
    'GO',
    "EXEC sp_addextendedproperty N'MS_Description', N'用户表', N'SCHEMA', N'dbo', N'TABLE', N'T_User'",
    'GO',
    "EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'用户名', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'T_User', @level2type = N'COLUMN', @level2name = N'UserName'",
    'GO',
    "EXEC sp_addextendedproperty 'MS_Description', '年龄', 'SCHEMA', 'dbo', 'TABLE', 't_user', 'COLUMN', 'age';",
    "EXEC sp_addextendedproperty N'Other', N'不是描述', N'SCHEMA', N'dbo', N'TABLE', N'T_User', N'COLUMN', N'Id'"
  ].join('\n');
  var tss = table(ss);
  t.equal(tss.comment, '用户表', 'SQL Server：表级 MS_Description（位置参数）');
  t.equal(col(tss, 'UserName').comment, '用户名', 'SQL Server：列级 MS_Description（@name = 形式，sys. 前缀）');
  t.equal(col(tss, 'Age').comment, '年龄', 'SQL Server：表名 / 列名大小写不敏感，无 N 前缀');
  t.equal(col(tss, 'Id').comment, null, 'SQL Server：非 MS_Description 的扩展属性忽略');
  t.equal(tss.dialect, 'sqlserver', '方言识别：sqlserver');

  var inl = table([
    'CREATE TABLE t (',
    '  a int NOT NULL, -- 甲',
    '  b int /* 乙 */,',
    '  c int',
    '  , d int -- 丁',
    '  , e int NOT NULL # 戊',
    ')'
  ].join('\n'));
  t.equal(col(inl, 'a').comment, '甲', '行尾 -- 注释（逗号后）');
  t.equal(col(inl, 'b').comment, '乙', '行尾 /* */ 注释（逗号前）');
  t.equal(col(inl, 'c').comment, null, '下一行的注释不归属上一列');
  t.equal(col(inl, 'd').comment, '丁', '前置逗号风格的行尾注释');
  t.equal(col(inl, 'e').comment, '戊', 'MySQL # 行尾注释');
  var pri = table("CREATE TABLE `t` (`a` int COMMENT '正式' -- 行尾\n)");
  t.equal(col(pri, 'a').comment, '正式', 'COMMENT 优先于行尾注释');

  // ---------- 类型映射 ----------
  function cs(type, dialect) { return L.sqlTypeToCSharp({ sqlType: type, length: null }, dialect); }
  [['int', 'int'], ['bigint', 'long'], ['smallint', 'short'], ['tinyint', 'byte'], ['bit', 'bool'],
    ['decimal', 'decimal'], ['numeric', 'decimal'], ['money', 'decimal'], ['float', 'double'], ['real', 'float'],
    ['char', 'string'], ['varchar', 'string'], ['nchar', 'string'], ['nvarchar', 'string'], ['text', 'string'],
    ['ntext', 'string'], ['longtext', 'string'], ['json', 'string'], ['date', 'DateTime'], ['datetime', 'DateTime'],
    ['datetime2', 'DateTime'], ['smalldatetime', 'DateTime'], ['datetimeoffset', 'DateTimeOffset'], ['time', 'TimeSpan'],
    ['uniqueidentifier', 'Guid'], ['varbinary', 'byte[]'], ['binary', 'byte[]'], ['image', 'byte[]'], ['blob', 'byte[]']
  ].forEach(function (p) { t.equal(cs(p[0]), p[1], '类型映射：' + p[0] + ' → ' + p[1]); });
  t.equal(L.sqlTypeToCSharp({ sqlType: 'tinyint', length: 1 }, 'mysql'), 'bool', 'MySQL tinyint(1) → bool');
  t.equal(L.sqlTypeToCSharp({ sqlType: 'tinyint', length: 1 }, 'sqlserver'), 'byte', 'SQL Server tinyint 不受 (1) 影响');
  t.equal(cs('timestamp', 'mysql'), 'DateTime', 'MySQL timestamp → DateTime');
  t.equal(cs('timestamp', 'sqlserver'), 'byte[]', 'SQL Server timestamp（rowversion）→ byte[]');
  t.equal(cs('geography'), null, '未知类型返回 null');

  // ---------- 代码生成 ----------
  var out = code(ss);
  t.ok(has(out, 'public class User\n'), '类名：去 T_ 前缀并 PascalCase');
  t.ok(has(out, '[Table("T_User")]'), '类名与表名不同时输出 [Table]');
  t.ok(has(out, '/// <summary>\n/// 用户表\n/// </summary>\n[Table("T_User")]'), '表注释 → 类 summary');
  t.ok(has(out, '    /// <summary>\n    /// 用户名\n    /// </summary>\n    public string UserName { get; set; } = string.Empty;'), '列注释 → 属性 summary；NOT NULL string 初始化');
  t.ok(has(out, 'public int? Age { get; set; }'), '可空值类型加 ?');
  t.ok(has(out, 'public int Id { get; set; }'), '非空值类型不加 ?');
  t.ok(!has(out, '[Column('), '属性名与列名相同不输出 [Column]');
  t.ok(has(out, 'using System.ComponentModel.DataAnnotations.Schema;') && !has(out, 'using System;'), 'using 按需生成');

  var my2 = "CREATE TABLE `tb_order_item` (`order_id` int NOT NULL, `sku_code` varchar(20) DEFAULT NULL, `qty` tinyint(1) NOT NULL, PRIMARY KEY (`order_id`)) ENGINE=InnoDB;";
  var o2 = code(my2, { lengthAttr: 'MaxLength' });
  t.ok(has(o2, 'public class OrderItem'), 'tb_ 前缀去除');
  t.ok(has(o2, '[Column("order_id")]\n    public int OrderId'), '属性名与列名不同输出 [Column]');
  t.ok(has(o2, '[Key]'), '主键 [Key]');
  t.ok(has(o2, '[MaxLength(20)]'), 'MaxLength 特性');
  t.ok(has(o2, 'public string SkuCode { get; set; }\n'), '可空 string（未启用可空引用类型）不加 ? 也不初始化');
  t.ok(has(o2, 'public bool Qty'), 'tinyint(1) → bool');
  t.ok(has(code(my2, { nullableRef: true }), 'public string? SkuCode'), '启用可空引用类型：可空 string 加 ?');

  var o3 = code('CREATE TABLE T_A ([user_name] nvarchar(10) NOT NULL, [Id] int IDENTITY(1,1) PRIMARY KEY)', { naming: 'original', requiredAttr: true, lengthAttr: 'StringLength', prefixes: '' });
  t.ok(has(o3, 'public class T_A'), '保留原名 + 不去前缀');
  t.ok(has(o3, 'public string user_name'), '保留原名：属性不转换');
  t.ok(has(o3, '[Required]\n    [StringLength(10)]\n    public string user_name'), '[Required] 与 [StringLength]');
  t.ok(has(o3, '[Key]\n    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]\n    public int Id'), '[Key] 与自增特性，主键不重复 [Required]');
  t.ok(has(o3, 'using System.ComponentModel.DataAnnotations;'), '用到 DataAnnotations 时生成 using');

  var o4 = code('CREATE TABLE x (class int, [1st] int, [ID] int, [x] int, [Geo] geography)', { naming: 'original', prefixes: [] });
  t.ok(has(o4, 'public int? @class'), 'C# 关键字加 @');
  t.ok(has(o4, 'public int? _1st'), '数字开头加下划线');
  t.ok(has(o4, 'public int? xValue'), '属性名与类名相同时加 Value');
  t.ok(has(o4, '// TODO: 未识别的 SQL 类型 geography\n    public object? Geo') || has(o4, '// TODO: 未识别的 SQL 类型 geography\n    public object Geo'), '未知类型 → object + TODO 注释');
  t.ok(has(code('CREATE TABLE t ([ID] int)'), 'public int? Id'), '全大写列名 ID → Id');

  var o5 = code("CREATE TABLE t (a int COMMENT 'x < y & z > 0\n第二行')", { naming: 'pascal' });
  t.ok(has(o5, '/// x &lt; y &amp; z &gt; 0\n    /// 第二行'), 'summary XML 转义与多行');
  t.ok(!has(code("CREATE TABLE t (a int COMMENT 'x')", { summary: false }), '<summary>'), '关闭 summary');

  var o6 = code('CREATE TABLE t (a datetime NOT NULL)', { namespace: 'App.Models' });
  t.ok(has(o6, 'using System;\nusing System.ComponentModel.DataAnnotations.Schema;\n\nnamespace App.Models\n{\n    [Table("t")]\n    public class T\n    {\n        [Column("a")]\n        public DateTime A { get; set; }\n    }\n}'), '命名空间包裹与缩进；DateTime 需要 using System', o6);

  var o7 = L.sqlToCSharp('CREATE TABLE a (x int COMMENT \'甲\', y int);\nCREATE TABLE b (z int)');
  t.deepEqual([o7.tables, o7.columns, o7.commented], [2, 3, 1], '统计：表数 / 列数 / 带注释列数');
  t.ok(has(code('CREATE TABLE [sales].[T_A] (x int)'), '[Table("T_A", Schema = "sales")]'), '非 dbo 架构写入 [Table] Schema');
  t.ok(has(code('CREATE TABLE T_A (x int);\nCREATE TABLE tb_a (y int)'), 'public class A2'), '类名冲突加序号');
};

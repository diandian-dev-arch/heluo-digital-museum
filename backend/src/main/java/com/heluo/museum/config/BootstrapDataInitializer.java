package com.heluo.museum.config;

import java.util.List;
import java.time.LocalDate;
import java.time.LocalTime;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates only local development data when explicitly enabled through environment variables.
 * No password is embedded in source code, migrations, or image layers.
 */
@Component
@ConditionalOnProperty(name = "museum.bootstrap.enabled", havingValue = "true")
public class BootstrapDataInitializer implements CommandLineRunner {
    private final JdbcTemplate jdbc;
    private final String username;
    private final String password;
    private final String email;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    BootstrapDataInitializer(JdbcTemplate jdbc,
                             @Value("${museum.bootstrap.admin-username:}") String username,
                             @Value("${museum.bootstrap.admin-password:}") String password,
                             @Value("${museum.bootstrap.admin-email:}") String email) {
        this.jdbc = jdbc;
        this.username = username;
        this.password = password;
        this.email = email;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (username.isBlank() || password.isBlank()) {
            throw new IllegalStateException("启用 MUSEUM_BOOTSTRAP_ENABLED 时必须设置管理员用户名和密码");
        }
        long adminId = createOrLocateAdmin();
        createCategories();
        createArtifacts(adminId);
        createExhibit(adminId);
        createArticles(adminId);
        createAppointmentSlots(adminId);
        createProducts(adminId);
    }

    private long createOrLocateAdmin() {
        Long existingId = jdbc.query("select id from users where username=?", (rs, rowNum) -> rs.getLong(1), username)
                .stream().findFirst().orElse(null);
        long adminId;
        if (existingId == null) {
            jdbc.update("insert into users(username,password_hash,nickname,email,status) values(?,?,?,?, 'ACTIVE')",
                    username, passwordEncoder.encode(password), "博物馆管理员", email.isBlank() ? null : email.trim());
            adminId = jdbc.queryForObject("select id from users where username=?", Long.class, username);
        } else {
            adminId = existingId;
        }
        long adminRoleId = jdbc.queryForObject("select id from roles where code='ADMIN'", Long.class);
        Integer hasRole = jdbc.queryForObject("select count(*) from user_roles where user_id=? and role_id=?", Integer.class,
                adminId, adminRoleId);
        if (hasRole != null && hasRole == 0) {
            jdbc.update("insert into user_roles(user_id,role_id) values(?,?)", adminId, adminRoleId);
        }
        return adminId;
    }

    private void createCategories() {
        insertCategory("BRONZE", "青铜礼器", "从器形、纹样与礼制故事认识河洛文化中的青铜意象。", 10);
        insertCategory("JADE", "玉石意象", "用轻量故事化内容了解玉礼、符号与古人的精神表达。", 20);
        insertCategory("RIVER", "河洛故事", "从河流、图纹和生活器物出发，连接传统文化与今天。", 30);
    }

    private void insertCategory(String code, String name, String description, int sortOrder) {
        if (count("select count(*) from categories where code=?", code) == 0) {
            jdbc.update("insert into categories(code,name,description,sort_order,enabled) values(?,?,?,?,1)",
                    code, name, description, sortOrder);
        }
    }

    private void createArtifacts(long adminId) {
        insertArtifact(adminId, "BRONZE", "河洛纹青铜爵（概念展品）", "heluo-bronze-jue",
                "青铜时代意象", "青铜", "/media/exhibits/bronze-jue-cover.webp", "IMG-EXHIBIT-BRONZE-JUE",
                "一件以河洛纹样为灵感的原创概念器物，用轻量的故事入口带你观察器形与纹样。",
                "这是项目组自主创作的概念展品，不对应任何真实馆藏。可以先从细长的器身、外撇的足部和器表纹样开始观察：器物不仅是使用工具，也承载着礼仪、审美与人与人之间的关系。\n\n在数字博物馆里，我们用故事化的方式拆解这些细节，让第一次接触青铜文化的访客也能从一个清晰问题开始探索：它为什么长成这样？纹样想表达什么？");
        insertArtifact(adminId, "JADE", "河图玉璧（概念展品）", "river-map-jade-bi",
                "传统玉礼意象", "玉石", "/media/exhibits/jade-bi-cover.webp", "IMG-EXHIBIT-JADE-BI",
                "圆形与中孔构成克制的视觉秩序，邀请你从“礼”和“象征”理解玉的文化表达。",
                "这是项目组自主创作的概念展品。圆形玉器在中国传统文化中常被赋予完整、循环与沟通的想象；中孔则使它在视觉上形成内外相望的结构。\n\n不必急着记住术语。先观察圆与孔如何让视线停留，再想想古人为什么愿意用一块温润的材料表达对天地与秩序的理解。");
        insertArtifact(adminId, "RIVER", "彩陶水纹罐（概念展品）", "painted-pottery-water-jar",
                "史前生活意象", "陶", "/media/exhibits/painted-pottery-jar-cover.webp", "IMG-EXHIBIT-POTTERY-JAR",
                "水纹与器形结合，让日常容器成为记录生活节奏的一页。",
                "这是项目组自主创作的概念展品。陶器的魅力不只在年代，更在它与日常生活的距离：盛放、保存、分享，都需要一个可靠的容器。\n\n器身上的水纹把河流意象带入了日常。面对它时，可以试着想象手工塑形的节奏，以及一条河如何影响聚落、食物和人的迁徙。");
        insertArtifact(adminId, "RIVER", "河洛图纹石板（概念展品）", "river-map-pattern-stone",
                "河洛符号意象", "石", "/media/exhibits/river-map-stone-cover.webp", "IMG-EXHIBIT-RIVER-STONE",
                "抽象图纹把河流、方位与秩序的想象浓缩在一块可近观的石板上。",
                "这是项目组自主创作的概念展品。图纹不是单纯的装饰：重复、对称和留白会把人的视线引向某种秩序感。\n\n数字页面放大了观察的机会。你可以停下来看看哪些线条像水流，哪些结构像地图，再把自己的理解写成一个关键词。");
        insertArtifact(adminId, "BRONZE", "水鸟青铜雕塑（概念展品）", "water-bird-bronze",
                "动物纹样意象", "青铜", "/media/exhibits/water-bird-bronze-cover.webp", "IMG-EXHIBIT-WATER-BIRD",
                "以水鸟姿态连接自然观察与古代器物的想象。",
                "这是项目组自主创作的概念展品。动物形象让抽象的材料有了方向与情绪：抬头、停驻或欲飞，都会让观者联想到水岸、季节和迁徙。\n\n它提醒我们，传统器物中的自然意象并不遥远。今天的人仍然会从鸟、河流和光影里寻找与生活相关的故事。");
    }

    private void insertArtifact(long adminId, String categoryCode, String title, String slug, String period, String material,
                                String coverUrl, String assetRef, String summary, String content) {
        if (count("select count(*) from artifacts where slug=?", slug) > 0) {
            return;
        }
        long categoryId = jdbc.queryForObject("select id from categories where code=?", Long.class, categoryCode);
        jdbc.update("insert into artifacts(category_id,title,slug,period,material,cover_image_url,cover_asset_ref,summary,content,"
                        + "status,published_at,created_by,updated_by) values(?,?,?,?,?,?,?,?,?,'PUBLISHED',current_timestamp(3),?,?)",
                categoryId, title, slug, period, material, coverUrl, assetRef, summary, content, adminId, adminId);
    }

    private void createArticles(long adminId) {
        insertArticle(adminId, "BRONZE", "第一次看青铜器，可以从哪三个问题开始？", "how-to-read-bronze",
                "/media/exhibits/bronze-jue-cover.webp", "IMG-EXHIBIT-BRONZE-JUE",
                "不用先背年代和术语：从器形、纹样和使用场景三个问题，建立自己的观察路径。",
                "河洛数字博物馆", "面对一件青铜器，先问三个简单问题。\n\n第一，它像什么？器形会告诉我们它可能与盛放、烹煮、陈设或礼仪有关。第二，表面有什么？重复的线条、动物形象和几何结构，往往在组织一种视觉节奏。第三，它会出现在哪里？把器物放回人与人相聚、祭祀或日常使用的场景，理解就会变得具体。\n\n数字浏览的优势，是可以暂停、放大和反复查看。请允许自己先有感受，再慢慢补充知识。 ");
        insertArticle(adminId, "RIVER", "把河流看成一条时间线：河洛文化的年轻化阅读", "river-as-timeline",
                "/media/exhibits/river-map-stone-cover.webp", "IMG-EXHIBIT-RIVER-STONE",
                "从水、聚落和纹样的联系出发，让传统文化不再只是书本上的名词。",
                "河洛数字博物馆", "河流带来水源、交通和交流，也让人们产生关于方位、季节和秩序的想象。\n\n当我们今天阅读河洛文化，可以不把它当作遥远的结论，而把它看作一条仍在流动的时间线：一边是器物与图纹留下的线索，另一边是我们如何用新的语言重新理解它。\n\n这也是数字博物馆想做的事——用图片、故事和互动入口，让第一次到访的人愿意停下来。 ");
        insertArticle(adminId, "JADE", "为什么“留白”让一件展品更容易被看见？", "why-negative-space-matters",
                "/media/exhibits/jade-bi-cover.webp", "IMG-EXHIBIT-JADE-BI",
                "数字展览不靠信息堆叠，而让器物、文字与视线之间保留呼吸感。",
                "河洛数字博物馆", "当页面上只有一张图片、一段简短文字和足够的空白时，观者反而更容易开始观察。\n\n留白不是缺少内容，而是一种邀请：邀请你把注意力留给器物的轮廓、材料的质感，也留给自己提出问题的时间。\n\n对于年轻访客来说，好的数字展览不是替你给出所有答案，而是让你愿意继续点开下一个故事。 ");
    }

    private void createExhibit(long adminId) {
        String slug = "heluo-bronze-ding-3d";
        if (count("select count(*) from exhibits_3d where slug=?", slug) > 0) {
            return;
        }
        long artifactId = jdbc.queryForObject("select id from artifacts where slug='heluo-bronze-jue'", Long.class);
        jdbc.update("insert into exhibits_3d(artifact_id,title,slug,summary,description,model_url,model_source_ref,model_format,model_size_bytes,cover_image_url,cover_asset_ref,status,published_at,created_by,updated_by) "
                        + "values(?,?,?,?,?,?,?,?,?,?,?,'PUBLISHED',current_timestamp(3),?,?)", artifactId,
                "河洛青铜鼎 · 互动概念展项", slug,
                "基于 Cleveland Museum of Art 1962.281 CC0 鼎模型，保留原始器型与纹样并重制真实古青铜 PBR 材质的数字展项，支持旋转、缩放和近观纹样。",
                "本展项以 Cleveland Museum of Art 1962.281 Tripod (Ding) 的 CC0 模型为基础网格，保留原始器型与纹样，由项目完成法线、AO、粗糙度、金属度和局部氧化铜绿重制，并使用深色博物馆顶光展厅呈现。该版本不是馆方扫描数据或官方复原。请拖动模型旋转视角，使用滚轮或双指缩放；若设备不支持 WebGL，仍可查看封面图和文字说明。",
                "/media/models/heluo-bronze-ding-v5.5.glb", "MODEL-HELUO-BRONZE-DING-V5-5-CMA-1962-281-CC0-CENTERLINE-FIX", "GLB", 5213372L,
                "/media/exhibits/heluo-bronze-ding-v5.4-cover.webp", "IMG-MODEL-HELUO-BRONZE-DING-V5-4", adminId, adminId);
    }

    private void createAppointmentSlots(long adminId) {
        insertSlot(adminId, LocalDate.now().plusDays(2), LocalTime.of(10, 0), LocalTime.of(11, 30), 30);
        insertSlot(adminId, LocalDate.now().plusDays(2), LocalTime.of(14, 0), LocalTime.of(15, 30), 30);
        insertSlot(adminId, LocalDate.now().plusDays(5), LocalTime.of(10, 0), LocalTime.of(11, 30), 40);
    }

    private void insertSlot(long adminId, LocalDate date, LocalTime start, LocalTime end, int capacity) {
        if (count("select count(*) from appointment_slots where visit_date=? and start_time=? and end_time=?", date, start, end) == 0) {
            jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,status,created_by,updated_by) values(?,?,?,?, 'OPEN',?,?)",
                    date, start, end, capacity, adminId, adminId);
        }
    }

    private void createProducts(long adminId) {
        insertProduct(adminId, "HL-NOTEBOOK-01", "河图纹笔记本", "river-map-notebook", "把河洛图纹带进每天的记录与灵感。", "原创河洛风格文创概念商品，仅用于第一版模拟商城演示。", "39.00", 30, "/media/products/river-map-notebook.webp", "IMG-PRODUCT-NOTEBOOK");
        insertProduct(adminId, "HL-SCARF-01", "河洛水系丝巾", "heluo-silk-scarf", "以河流的流线和深墨绿为灵感的原创概念丝巾。", "原创河洛风格文创概念商品，仅用于第一版模拟商城演示。", "129.00", 20, "/media/products/heluo-silk-scarf.webp", "IMG-PRODUCT-SCARF");
        insertProduct(adminId, "HL-CUP-01", "河流纹茶杯套装", "river-line-teacup-set", "让日常饮茶也保留一段关于河流的想象。", "原创河洛风格文创概念商品，仅用于第一版模拟商城演示。", "89.00", 15, "/media/products/river-line-teacup-set.webp", "IMG-PRODUCT-CUP");
    }

    private void insertProduct(long adminId, String sku, String name, String slug, String summary, String description, String price, int stock, String coverUrl, String assetRef) {
        if (count("select count(*) from products where slug=?", slug) > 0) return;
        jdbc.update("insert into products(sku,name,slug,summary,description,price,stock_quantity,cover_image_url,cover_asset_ref,status,published_at,created_by,updated_by) values(?,?,?,?,?,?,?,?,?,'PUBLISHED',current_timestamp(3),?,?)",
                sku,name,slug,summary,description,new java.math.BigDecimal(price),stock,coverUrl,assetRef,adminId,adminId);
    }

    private void insertArticle(long adminId, String categoryCode, String title, String slug, String coverUrl, String assetRef,
                               String summary, String author, String content) {
        if (count("select count(*) from articles where slug=?", slug) > 0) {
            return;
        }
        long categoryId = jdbc.queryForObject("select id from categories where code=?", Long.class, categoryCode);
        jdbc.update("insert into articles(category_id,title,slug,cover_image_url,cover_asset_ref,summary,content,author_display,"
                        + "status,published_at,created_by,updated_by) values(?,?,?,?,?,?,?,?, 'PUBLISHED',current_timestamp(3),?,?)",
                categoryId, title, slug, coverUrl, assetRef, summary, content, author, adminId, adminId);
    }

    private long count(String sql, Object... values) {
        return jdbc.queryForObject(sql, Long.class, values);
    }
}

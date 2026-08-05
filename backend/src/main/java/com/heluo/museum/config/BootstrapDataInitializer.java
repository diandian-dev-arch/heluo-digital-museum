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
                categoryId, title, slug, period, material, coverUrl, assetRef, summary,
                artifactEditorialContent(slug, content), adminId, adminId);
    }

    private String artifactEditorialContent(String slug, String fallback) {
        return switch (slug) {
            case "water-bird-bronze" -> """
                    观察入口｜先看姿态

                    这是一件由项目组自主创作的概念展品，并非真实馆藏复原。水鸟昂首而立，细长颈部把视线从足部引向头部，收拢的双翼则让身体保持稳定。观看它时，可以先不判断它属于哪个年代，只留意一条曲线怎样让金属显得轻盈，又怎样在静止中保留欲行、欲飞的张力。

                    器形与材料｜把生命感交给青铜

                    青铜通常给人厚重、坚固的印象，水鸟却代表水岸、迁徙与季节变化。创作把两种相反感受放在一起：坚硬材料承载柔软羽翼，稳定足部托起向前伸展的长颈。表面的河流旋纹不是对古代纹样的复制，而是用连续线条提示羽毛、水波与时间流动。

                    文化语境｜古人如何观看自然

                    中国早期器物中常见鸟、兽及复合动物形象。它们可能关联环境观察、身份表达、礼仪想象，也可能只是工匠组织器表秩序的方法。面对概念作品，我们不替历史给出唯一答案，而借水鸟提出一个问题：当自然形象进入器物，人们保存的是动物的外形，还是与水域、季节和生活经验有关的记忆？

                    当代阅读｜从标本式观看走向关系式观看

                    今天的观众可以把这件作品看作人与环境关系的缩影。鸟需要湿地，聚落依赖水系，材料又来自采集、冶炼和协作。器物因此不只是一个孤立造型，也连接生态、技术与共同体。数字放大让我们看清纹线，同时也提醒我们把目光重新放回真实河流与生命环境。

                    留给观众的问题

                    如果把昂首改为低头、把双翼改为展开，这件作品的情绪会发生什么变化？请从姿态、材料和纹样中选一个细节，为它写下一句属于你的水岸故事。
                    """;
            case "heluo-bronze-jue" -> """
                    观察入口｜器形先于年代

                    这是一件河洛纹样主题的原创概念器物，不对应真实馆藏。先沿轮廓观看：收束的腹部、向外展开的口沿和支撑身体的足部，共同形成上张、下稳的节奏。器形并非随意装饰，它决定手如何接近、液体如何盛放，也决定器物在空间中显得庄重还是轻巧。

                    功能想象｜使用动作塑造形态

                    爵类器物常让人联想到饮用、温酒与礼仪场景，但概念创作不把某一历史用途直接套在作品上。我们更关心动作与形态的关系：足部提供稳定，流部暗示倾倒，器身容量回应盛放。把这些动作连起来，静止的器物便出现了一条可能的使用路径。

                    纹样阅读｜秩序不是填满表面

                    器表采用项目组重新组织的河流曲线与几何单元。重复让视线建立节拍，对称提供稳定，局部留白则使纹样不至于失去层次。它借鉴青铜装饰的组织方式，却不冒充具体历史纹样。判断一组纹样是否有效，可以看它是否顺应器形转折，而不是只看细节是否繁复。

                    礼与共同体｜器物为何超越工具

                    当器物进入宴饮、祭告或重要相聚，它会参与人与人的关系。材料的稀缺、制作的协作和使用场合，共同赋予它超出日常工具的意义。礼并不只是遥远制度，也是一套让行动有次序、让共同体确认彼此位置的方式。

                    留给观众的问题

                    请分别从器形、纹样和使用场景提出一个问题。与其先背术语，不如先说明你看见了什么、它可能怎样被使用，以及为什么人们愿意把如此多的劳动投入一件器物。
                    """;
            case "river-map-jade-bi" -> """
                    观察入口｜圆与孔之间

                    这是一件由项目组自主创作的玉璧概念展品。它最重要的不是复杂纹样，而是圆形外缘与中央孔洞建立的关系。外圆把视线聚拢，中孔又让视线穿过器物；实体与空处相互定义，使一块材料获得克制而持续的张力。

                    材料经验｜温润来自时间

                    玉石的光泽不会像镜面那样立即夺目，它需要移动视角才能看见细微变化。切割、钻孔、研磨与抛光都意味着漫长劳动。材料价值因此不仅来自稀少，也来自人对时间和手艺的投入。数字图像可以放大纹理，却无法完全替代光线在真实表面缓慢移动的经验。

                    象征结构｜完整、沟通与秩序

                    圆形玉器在传统文化中常被联系到完整、循环、身份与礼仪。不同年代和语境中的含义并不相同，不能用一句固定答案概括。概念作品保留圆与孔的基本结构，是为了让观众理解：象征往往不是附加说明，而是从形状、材料、使用方式和共同认知中逐渐形成。

                    留白的价值｜空处也是内容

                    中孔不是缺失，页面留白也不是空洞。它们都为观看提供停顿，让边缘、厚度与光影更容易被发现。当信息不断涌来时，玉璧提醒我们放慢速度：一次只观察一个转折、一束反光或一道细纹。

                    留给观众的问题

                    如果中央孔更小、外缘更厚，作品还会保持现在的轻盈和平衡吗？试着用“完整”“边界”“穿越”三个词中的一个，解释你如何理解这件概念玉器。
                    """;
            case "painted-pottery-water-jar" -> """
                    观察入口｜从一只容器开始

                    这是一件项目组自主创作的彩陶概念展品。宽腹提供容量，收口便于保存与搬运，底部让器物能够稳定放置。它首先是一只与盛放有关的容器，随后才成为纹样与故事的载体。理解陶器，可以从身体尺度和日常动作开始，而不是只从年代标签开始。

                    制作过程｜泥土如何获得形状

                    从选土、淘洗、揉泥、成形到干燥和烧制，每一步都会留下痕迹。器壁厚薄关系到受热与强度，口沿和腹部转折反映手的控制，烧成气氛则影响颜色。即使是概念作品，也通过这些工艺逻辑保持可信：好看的轮廓必须能够被材料支持。

                    水纹与聚落｜装饰连接生活环境

                    器身水纹来自河流意象。水不仅是图案，也与饮用、种植、交通和聚落选择有关。重复波线把流动的河变成可环绕观看的节奏，使一个日常容器成为环境记忆的载体。它提示我们，所谓文明并非抽象名词，而是许多稳定生活方式逐渐累积的结果。

                    修补与珍惜｜使用痕迹也是历史

                    真实陶器常有磨损、烟炱、裂纹和修补。它们并不降低观看价值，反而说明器物曾经被需要。数字展览容易呈现完整、洁净的形象，因此更需要提醒观众：器物的意义也存在于反复使用、损坏和被珍惜的过程里。

                    留给观众的问题

                    如果要为河边聚落设计一只容器，你会优先考虑容量、搬运、密封还是纹样？选择一个需求，并说明它将怎样改变器形。
                    """;
            case "river-map-pattern-stone" -> """
                    观察入口｜先追踪一条线

                    这是一件河洛图纹主题的原创概念石板，并非考古文物。观看时可以从任意一条线出发，追踪它如何转折、交汇和停止。线条的方向会引导视线移动，节点让视线停顿，留白则把不同区域分开。抽象图形因此能够像路线一样被阅读。

                    石与刻痕｜不可轻易撤回的书写

                    石材坚硬、沉重，刻下一道线需要明确动作。与纸上书写相比，刻痕更慢，也更难修改。材料特性让图形带有决定性：深浅形成层次，边缘保留工具方向，表面磨损又记录时间。数字放大可以帮助辨认刻痕，但不能把推测变成确定事实。

                    图与地图｜相似不等于证明

                    河流、道路、星点和方位都可能被人联想到这组图纹，但视觉相似不能直接证明历史含义。策展说明应区分“看起来像什么”与“有证据说明什么”。概念作品主动保留开放性，让观众练习提出解释，同时说明解释需要材料、语境和比较对象支持。

                    秩序想象｜人在复杂世界中寻找结构

                    人们不断用图形整理空间、时间与关系。从结绳、刻画到地图和数据图表，抽象符号帮助我们把难以把握的世界转化为可讨论的结构。河洛图纹在此成为一种当代阅读入口：我们如何从流动中发现节点，又如何避免把自己的期待误认为唯一答案。

                    留给观众的问题

                    请为石板选择一种阅读方式：河流图、方位图或关系图。指出支持这种解释的两个视觉细节，再指出一个可能反驳它的细节。好的观看不仅寻找答案，也保留修正答案的空间。
                    """;
            default -> fallback;
        };
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

    private String articleEditorialContent(String slug, String fallback) {
        return switch (slug) {
            case "how-to-read-bronze" -> """
                    观察从器形开始｜它为什么长成这样

                    第一次面对青铜器，不必急着记年代、名称或纹样术语。先把它当作一个需要被使用的物件，沿着轮廓看一遍：口沿是敞开还是收束，器腹是宽阔还是紧凑，足部如何支撑重量，是否有便于提握或倾倒的部位。器形不是抽象风格，它往往回应盛放、加热、取用、移动和陈设等具体动作。

                    观察时可以问：如果把器口缩小、足部变短，使用方式会发生什么变化？当一个局部看起来特别夸张，它可能是在解决功能问题，也可能在强调观看时的秩序和身份。先说明自己看见了什么，再讨论它可能意味着什么，判断会更稳妥。

                    纹样如何组织视线｜不要只寻找名称

                    青铜器表面的线条、凸起和重复单元会引导眼睛移动。你可以寻找三个关系：纹样是否顺着器身转折，重复之间有没有节奏，留白是否让某个区域成为焦点。即使暂时叫不出纹样名称，也能描述它是密集还是疏朗、对称还是偏移、连续还是被边界截断。

                    数字图像适合放大细节，但放大也可能让人忽略整体。看完局部后退回完整器形，确认纹样怎样与轮廓、把手、足部和口沿共同工作。名称是后续检索的工具，不是观看的起点。

                    把器物放回场景｜谁在什么时刻使用它

                    第三个问题是：它会出现在哪里？器物的意义不仅在材料和外形中，也在使用者、动作与场合之间。盛放食物、温酒、宴饮、祭告或陈设，会形成不同的人际关系和空间秩序。材料取得、铸造分工和反复使用留下的磨损，也说明一件器物如何进入共同体生活。

                    面对资料不足的展品，应把事实、合理推测和个人联想分开。我们可以根据器形提出用途假设，却不把假设写成确定历史；可以由纹样产生情绪，也要承认这种感受来自今天的观看者。

                    数字观看练习｜形成自己的三问路径

                    现在回到展品，依次完成三个动作：用一句话描述器形，用三个形容词描述纹样，再为它想象一个有依据的使用场景。随后对照展签或研究资料，看看哪些判断得到支持，哪些需要修正。博物馆阅读不是一次答对，而是在观察、提问和求证之间来回移动。

                    留给观众的问题

                    从器形、纹样和使用场景中各选一个最吸引你的细节。它们能否共同解释这件器物为什么被制作、被使用，又被保存到今天？
                    """;
            case "river-as-timeline" -> """
                    从水系开始｜河流不是静止背景

                    阅读河洛文化，可以先把地图上的河流想成一条不断改写的时间线。水源影响聚落选择，洪旱改变生产节奏，渡口和支流连接原本分散的人群。河道并非永远固定，人的堤岸、道路与城市也会反过来改变水的路径。文明因此不是沿直线前进，而是在环境与选择之间持续调整。

                    观察地图时，不只寻找著名地点。可以留意河流在哪里汇合、哪里转弯、聚落为何靠近台地或交通节点。空间关系能帮助我们理解器物、技术和观念为什么会在某些区域相遇。

                    聚落与交通｜流动带来交换

                    河流提供饮水和灌溉，也构成搬运人与物的通道。陶器的制作经验、金属原料、纹样和礼仪观念，可能伴随迁徙、婚姻、贸易与协作而传播。相似并不自动证明同一来源，却提示我们继续比较材料、工艺和发现语境。

                    把河流看作时间线的价值，在于它能把孤立展品重新放进关系网络。一件器物不只是展柜中的终点，也是原料被采集、工匠参与制作、使用者赋予意义以及后来被发现和研究的一段旅程。

                    图纹与秩序｜人如何理解流动世界

                    波线、旋转、交汇和节点容易让今天的观众联想到水系与地图，但视觉相似不等于历史证明。更可靠的阅读方式，是区分作品明确提供的信息、基于比较形成的解释，以及个人观看产生的联想。三者都可以存在，只需标明边界。

                    河洛图纹在数字展览中承担的是阅读入口：它邀请我们思考人如何借图形整理方位、季节、关系与变化。抽象符号让复杂经验变得可讨论，也提醒我们任何秩序都是从特定视角建立的。

                    当代河流｜传统仍在发生

                    今天的河流同时连接生态、城市、交通和日常记忆。数字博物馆不应把传统封存在过去，而应让历史线索与当代问题相遇：我们怎样使用水，怎样理解家乡，怎样在发展中保存共同记忆。年轻化表达不是缩短历史，而是提供可以进入、比较和继续追问的路径。

                    你可以从一件器物、一段纹样或一次沿河行走开始，为自己的时间线加入节点。每个节点都写明看见了什么、依据来自哪里，以及还有什么尚未知道。

                    留给观众的问题

                    如果用“水源、聚落、交通、纹样、当代生活”五个节点画一条河洛时间线，你会怎样排列它们？哪些节点应该并行，而不是简单地分成先后？
                    """;
            case "why-negative-space-matters" -> """
                    留白不是空缺｜它在安排注意力

                    当一个页面同时出现大标题、说明、按钮、标签和多张图片时，观众需要不断判断先看哪里。留白通过拉开距离、减少竞争，为信息建立顺序。它不是没有设计的空处，而是让器物轮廓、文字节奏和操作入口各自获得清晰边界。

                    在数字展览里，留白尤其重要。屏幕比展厅更小，通知、滚动和交互又容易分散注意力。一次只突出一个主要对象，可以降低理解负担，让观众愿意多停留几秒。

                    焦点与层级｜让重要内容先被看见

                    判断留白是否有效，可以观察视线是否自然到达标题、展品和下一步操作。元素之间距离越近，越容易被理解为一组；距离拉开，则表示章节或任务发生变化。字号、对比度和位置建立第一层级，留白负责让这些层级真正可读。

                    留白并不等于所有地方都宽松。按钮、表单和数据列表需要紧凑而明确，长文阅读则需要稳定行宽和段落间距。好的界面会根据任务调整密度，而不是把每个区域都做成同样大小的卡片。

                    数字展览的节奏｜在靠近与退后之间切换

                    观看器物需要两种距离：靠近时辨认材料和纹样，退后时理解整体比例与空间关系。页面也应提供这种节奏。大图之后留出停顿，再进入说明；密集事实之后安排较短段落，让观众消化信息；重要操作出现前减少其他干扰。

                    动效可以帮助说明空间关系，却不应填满每一次停顿。持续漂浮、光晕和无目的运动会占用注意力。只有当内容进入、状态改变或操作得到反馈时，动效才真正服务阅读。

                    把解释权留给观众｜空处也容纳思考

                    博物馆不是把所有答案一次性塞给观众。适当留白意味着不急于替每个细节下结论，而是通过问题、比较和可继续探索的入口，让观众形成自己的观察。这样的空处并不减少知识，反而为求证和修正保留位置。

                    无障碍同样依赖清楚的空间组织。稳定的阅读顺序、足够的触控面积、可见焦点和不被遮挡的文字，能让键盘、触屏和不同视觉能力的用户完成同一任务。视觉上的克制最终应转化为使用上的清晰。

                    留给观众的问题

                    选择当前页面中的一件展品，先看十秒不读说明。留白让你首先注意到了什么？读完文字后，你的观察被证实、补充，还是发生了改变？
                    """;
            default -> fallback;
        };
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
                categoryId, title, slug, coverUrl, assetRef, summary,
                articleEditorialContent(slug, content), author, adminId, adminId);
    }

    private long count(String sql, Object... values) {
        return jdbc.queryForObject(sql, Long.class, values);
    }
}

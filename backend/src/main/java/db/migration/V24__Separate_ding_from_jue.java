package db.migration;

import java.sql.Statement;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/** A conditional data repair; existing or withdrawn administrator content is never replaced. */
public class V24__Separate_ding_from_jue extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        var connection = context.getConnection();
        boolean ownsTransaction = connection.getAutoCommit();
        if (ownsTransaction) connection.setAutoCommit(false);
        try {
            repair(context);
            if (ownsTransaction) connection.commit();
        } catch (Exception error) {
            if (ownsTransaction) {
                try { connection.rollback(); }
                catch (Exception rollbackError) { error.addSuppressed(rollbackError); }
            }
            throw error;
        } finally {
            if (ownsTransaction) connection.setAutoCommit(true);
        }
    }

    private void repair(Context context) throws Exception {
        var connection = context.getConnection();
        // An existing slug belongs to the administrator, including deleted/withdrawn records.
        try (var query = connection.prepareStatement("select id from artifacts where slug='heluo-bronze-ding'");
             var rows = query.executeQuery()) {
            if (rows.next()) return;
        }
        long exhibitId;
        long oldArtifactId;
        long categoryId;
        long authorId;
        try (var query = connection.prepareStatement("""
                select e.id, e.artifact_id, a.category_id, e.created_by
                from exhibits_3d e join artifacts a on a.id=e.artifact_id
                where e.slug='heluo-bronze-ding-3d' and a.slug='heluo-bronze-jue'
                  and e.title='河洛青铜鼎 · 互动概念展项'
                  and e.model_source_ref='MODEL-HELUO-BRONZE-DING-V5-5-CMA-1962-281-CC0-CENTERLINE-FIX'
                  and e.source_url='https://www.clevelandart.org/art/1962.281'
                  and e.status='PUBLISHED' and e.deleted_at is null
                  and a.status='PUBLISHED' and a.deleted_at is null
                """); var rows = query.executeQuery()) {
            if (!rows.next()) return;
            exhibitId = rows.getLong("id");
            oldArtifactId = rows.getLong("artifact_id");
            categoryId = rows.getLong("category_id");
            authorId = rows.getLong("created_by");
        }
        // Keep this historical text immutable; do not import evolving application seed constants.
        long dingId;
        try (var insert = connection.prepareStatement("""
                insert into artifacts(category_id,title,slug,period,material,cover_image_url,cover_asset_ref,
                    summary,content,status,published_at,created_by,updated_by)
                values(?, '河洛青铜鼎（数字重制）', 'heluo-bronze-ding', '原件年代见来源馆藏记录',
                    '青铜意象（数字材质）', '/media/exhibits/heluo-bronze-ding-v5.4-cover.webp',
                    'IMG-MODEL-HELUO-BRONZE-DING-V5-4', ?, ?, 'PUBLISHED', current_timestamp(3), ?, ?)
                """, Statement.RETURN_GENERATED_KEYS)) {
            insert.setLong(1, categoryId);
            insert.setString(2, "从三足、器腹与器表纹样近观一件鼎。基于 Cleveland Museum of Art 1962.281 的 CC0 模型进行项目数字重制。");
            insert.setString(3, """
                    观察入口｜从三足走近鼎

                    先沿着三足看向器腹，再把视线移到口沿。支撑、容纳与边缘共同组成这件鼎的轮廓。在三维视图中转动器物，可以比较正面与侧面的足部间距，观察器腹如何由宽转窄，以及纹样怎样沿着曲面连续展开。这里的三个观察点来自眼前的数字形态，不是对原件用途、年代或出土地点的考证结论。试着选择一个细节，先用自己的语言描述，再与来源馆藏记录对照。

                    数字重制｜你看到的是什么

                    本展品是项目数字重制，不是河洛地区出土或本项目收藏的实物。基础网格来自 Cleveland Museum of Art 的 1962.281 Tripod (Ding) CC0 模型；项目调整了材质、法线、局部纹理与展示灯光，v5.5 还对正面中心浮雕作了局部校正。画面颜色和表面效果不应作为原件当前状况的依据。本版本不是馆方扫描数据或官方复原。

                    资料来源｜原件与数字版本

                    原件资料：Cleveland Museum of Art，1962.281 Tripod (Ding)。https://www.clevelandart.org/art/1962.281

                    基础模型发布方：Cleveland Museum of Art（Sketchfab @clevelandart）；许可：CC0 Public Domain。https://sketchfab.com/3d-models/1962281-tripod-ding-af15e7980f9b4f718094fc2e16205d89

                    留给观众的问题

                    正面看似对称的轮廓，换一个视角后有什么变化？请在三足、器腹和纹样中选择一处，再进入 3D 展项验证自己的观察。
                    """);
            insert.setLong(4, authorId);
            insert.setLong(5, authorId);
            insert.executeUpdate();
            try (var keys = insert.getGeneratedKeys()) {
                if (!keys.next()) throw new IllegalStateException("Ding repair did not return an artifact ID");
                dingId = keys.getLong(1);
            }
        }
        try (var update = connection.prepareStatement("update exhibits_3d set artifact_id=? where id=? and artifact_id=?")) {
            update.setLong(1, dingId);
            update.setLong(2, exhibitId);
            update.setLong(3, oldArtifactId);
            if (update.executeUpdate() != 1) throw new IllegalStateException("Ding association changed during repair");
        }
    }
}

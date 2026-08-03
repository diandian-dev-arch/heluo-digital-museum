package com.heluo.museum.content;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.error.ConflictException;
import com.heluo.museum.common.error.ContentPage;
import com.heluo.museum.common.error.ResourceNotFoundException;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Administrator-only management endpoints for categories, artifacts and articles.
 * SecurityConfiguration makes the /admin prefix the trusted authorization boundary.
 */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminContentController {
    private final JdbcTemplate jdbc;

    AdminContentController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/categories")
    public ApiResponse<List<CategoryAdminView>> categories() {
        List<CategoryAdminView> items = jdbc.query(
                "select id,code,name,description,sort_order,enabled from categories order by sort_order,id",
                (rs, rowNum) -> new CategoryAdminView(rs.getLong("id"), rs.getString("code"), rs.getString("name"),
                        empty(rs.getString("description")), rs.getInt("sort_order"), rs.getBoolean("enabled")));
        return ApiResponse.ok(items, "admin-categories");
    }

    @PostMapping("/categories")
    public ApiResponse<CategoryAdminView> createCategory(@Valid @RequestBody CategoryInput input) {
        if (count("select count(*) from categories where code=? or name=?", input.code(), input.name()) > 0) {
            throw new ConflictException("分类编码或名称已存在");
        }
        jdbc.update("insert into categories(code,name,description,sort_order,enabled) values(?,?,?,?,?)",
                input.code(), input.name(), blank(input.description()), input.sortOrder(), input.enabled());
        long id = jdbc.queryForObject("select id from categories where code=?", Long.class, input.code());
        return ApiResponse.ok(categoryById(id), "admin-category-create");
    }

    @PatchMapping("/categories/{id}")
    public ApiResponse<CategoryAdminView> updateCategory(@PathVariable long id, @Valid @RequestBody CategoryInput input) {
        requireCategory(id);
        if (count("select count(*) from categories where (code=? or name=?) and id<>?", input.code(), input.name(), id) > 0) {
            throw new ConflictException("分类编码或名称已存在");
        }
        jdbc.update("update categories set code=?,name=?,description=?,sort_order=?,enabled=? where id=?", input.code(),
                input.name(), blank(input.description()), input.sortOrder(), input.enabled(), id);
        return ApiResponse.ok(categoryById(id), "admin-category-update");
    }

    @GetMapping("/artifacts")
    public ApiResponse<ContentPage<ArtifactAdminView>> artifacts(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "false") boolean deleted) {
        ArtifactController.PageRequest normalized = ArtifactController.PageRequest.of(page, size);
        String where = deleted ? " where a.deleted_at is not null" : " where a.deleted_at is null";
        long total = jdbc.queryForObject("select count(*) from artifacts a" + where, Long.class);
        List<ArtifactAdminView> items = jdbc.query(
                "select a.id,a.category_id,a.accession_no,a.title,a.slug,a.period,a.material,a.dimensions,"
                        + "a.collection_location,a.cover_image_url,a.cover_asset_ref,a.summary,a.content,a.status,a.deleted_at,"
                        + "c.code category_code,c.name category_name from artifacts a join categories c on c.id=a.category_id"
                        + where + " order by a.updated_at desc,a.id desc limit ? offset ?",
                (rs, rowNum) -> artifactView(rs), normalized.size(), normalized.offset());
        return ApiResponse.ok(ContentPage.of(items, normalized.page(), normalized.size(), total), "admin-artifacts");
    }

    @GetMapping("/artifacts/{id}")
    public ApiResponse<ArtifactAdminView> artifact(@PathVariable long id) {
        return ApiResponse.ok(findArtifact(id), "admin-artifact");
    }

    @PostMapping("/artifacts")
    @Transactional
    public ApiResponse<ArtifactAdminView> createArtifact(Authentication authentication, @Valid @RequestBody ArtifactInput input) {
        requireEnabledCategory(input.categoryId());
        if (count("select count(*) from artifacts where slug=?", input.slug()) > 0) {
            throw new ConflictException("文物 URL 标识已存在");
        }
        long actorId = actorId(authentication);
        jdbc.update("insert into artifacts(category_id,accession_no,title,slug,period,material,dimensions,collection_location,"
                        + "cover_image_url,cover_asset_ref,summary,content,created_by,updated_by) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                input.categoryId(), blank(input.accessionNo()), input.title(), input.slug(), blank(input.period()),
                blank(input.material()), blank(input.dimensions()), blank(input.collectionLocation()),
                blank(input.coverImageUrl()), blank(input.coverAssetRef()), blank(input.summary()), input.content(), actorId, actorId);
        long id = jdbc.queryForObject("select id from artifacts where slug=?", Long.class, input.slug());
        return ApiResponse.ok(findArtifact(id), "admin-artifact-create");
    }

    @PatchMapping("/artifacts/{id}")
    @Transactional
    public ApiResponse<ArtifactAdminView> updateArtifact(Authentication authentication, @PathVariable long id,
                                                          @Valid @RequestBody ArtifactInput input) {
        ArtifactAdminView existing = findArtifact(id);
        ensureNotDeleted(existing.deleted());
        requireEnabledCategory(input.categoryId());
        if (count("select count(*) from artifacts where slug=? and id<>?", input.slug(), id) > 0) {
            throw new ConflictException("文物 URL 标识已存在");
        }
        jdbc.update("update artifacts set category_id=?,accession_no=?,title=?,slug=?,period=?,material=?,dimensions=?,"
                        + "collection_location=?,cover_image_url=?,cover_asset_ref=?,summary=?,content=?,updated_by=? where id=?",
                input.categoryId(), blank(input.accessionNo()), input.title(), input.slug(), blank(input.period()),
                blank(input.material()), blank(input.dimensions()), blank(input.collectionLocation()),
                blank(input.coverImageUrl()), blank(input.coverAssetRef()), blank(input.summary()), input.content(),
                actorId(authentication), id);
        return ApiResponse.ok(findArtifact(id), "admin-artifact-update");
    }

    @PostMapping("/artifacts/{id}/publish")
    public ApiResponse<ArtifactAdminView> publishArtifact(Authentication authentication, @PathVariable long id) {
        ArtifactAdminView existing = findArtifact(id);
        ensureNotDeleted(existing.deleted());
        jdbc.update("update artifacts set status='PUBLISHED',published_at=current_timestamp(3),updated_by=? where id=?",
                actorId(authentication), id);
        return ApiResponse.ok(findArtifact(id), "admin-artifact-publish");
    }

    @PostMapping("/artifacts/{id}/withdraw")
    public ApiResponse<ArtifactAdminView> withdrawArtifact(Authentication authentication, @PathVariable long id) {
        ArtifactAdminView existing = findArtifact(id);
        ensureNotDeleted(existing.deleted());
        if (!"PUBLISHED".equals(existing.status())) {
            throw new ConflictException("只有已发布文物可以撤回");
        }
        jdbc.update("update artifacts set status='WITHDRAWN',updated_by=? where id=?", actorId(authentication), id);
        return ApiResponse.ok(findArtifact(id), "admin-artifact-withdraw");
    }

    @DeleteMapping("/artifacts/{id}")
    public ApiResponse<ArtifactAdminView> deleteArtifact(Authentication authentication, @PathVariable long id) {
        ArtifactAdminView existing = findArtifact(id);
        ensureNotDeleted(existing.deleted());
        jdbc.update("update artifacts set deleted_at=current_timestamp(3),deleted_by=?,updated_by=? where id=?",
                actorId(authentication), actorId(authentication), id);
        return ApiResponse.ok(findArtifact(id), "admin-artifact-delete");
    }

    @PostMapping("/artifacts/{id}/restore")
    public ApiResponse<ArtifactAdminView> restoreArtifact(Authentication authentication, @PathVariable long id) {
        ArtifactAdminView existing = findArtifact(id);
        if (!existing.deleted()) {
            throw new ConflictException("该文物不在回收站中");
        }
        jdbc.update("update artifacts set deleted_at=null,deleted_by=null,status='WITHDRAWN',updated_by=? where id=?",
                actorId(authentication), id);
        return ApiResponse.ok(findArtifact(id), "admin-artifact-restore");
    }

    @GetMapping("/articles")
    public ApiResponse<ContentPage<ArticleAdminView>> articles(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "false") boolean deleted) {
        ArtifactController.PageRequest normalized = ArtifactController.PageRequest.of(page, size);
        String where = deleted ? " where a.deleted_at is not null" : " where a.deleted_at is null";
        long total = jdbc.queryForObject("select count(*) from articles a" + where, Long.class);
        List<ArticleAdminView> items = jdbc.query(
                "select a.id,a.category_id,a.title,a.slug,a.cover_image_url,a.cover_asset_ref,a.summary,a.content,"
                        + "a.author_display,a.status,a.deleted_at,c.code category_code,c.name category_name "
                        + "from articles a join categories c on c.id=a.category_id" + where
                        + " order by a.updated_at desc,a.id desc limit ? offset ?",
                (rs, rowNum) -> articleView(rs), normalized.size(), normalized.offset());
        return ApiResponse.ok(ContentPage.of(items, normalized.page(), normalized.size(), total), "admin-articles");
    }

    @GetMapping("/articles/{id}")
    public ApiResponse<ArticleAdminView> article(@PathVariable long id) {
        return ApiResponse.ok(findArticle(id), "admin-article");
    }

    @PostMapping("/articles")
    @Transactional
    public ApiResponse<ArticleAdminView> createArticle(Authentication authentication, @Valid @RequestBody ArticleInput input) {
        requireEnabledCategory(input.categoryId());
        if (count("select count(*) from articles where slug=?", input.slug()) > 0) {
            throw new ConflictException("文章 URL 标识已存在");
        }
        long actorId = actorId(authentication);
        jdbc.update("insert into articles(category_id,title,slug,cover_image_url,cover_asset_ref,summary,content,author_display,"
                        + "created_by,updated_by) values(?,?,?,?,?,?,?,?,?,?)",
                input.categoryId(), input.title(), input.slug(), blank(input.coverImageUrl()), blank(input.coverAssetRef()),
                input.summary(), input.content(), blank(input.authorDisplay()), actorId, actorId);
        long id = jdbc.queryForObject("select id from articles where slug=?", Long.class, input.slug());
        return ApiResponse.ok(findArticle(id), "admin-article-create");
    }

    @PatchMapping("/articles/{id}")
    public ApiResponse<ArticleAdminView> updateArticle(Authentication authentication, @PathVariable long id,
                                                        @Valid @RequestBody ArticleInput input) {
        ArticleAdminView existing = findArticle(id);
        ensureNotDeleted(existing.deleted());
        requireEnabledCategory(input.categoryId());
        if (count("select count(*) from articles where slug=? and id<>?", input.slug(), id) > 0) {
            throw new ConflictException("文章 URL 标识已存在");
        }
        jdbc.update("update articles set category_id=?,title=?,slug=?,cover_image_url=?,cover_asset_ref=?,summary=?,content=?,"
                        + "author_display=?,updated_by=? where id=?", input.categoryId(), input.title(), input.slug(),
                blank(input.coverImageUrl()), blank(input.coverAssetRef()), input.summary(), input.content(),
                blank(input.authorDisplay()), actorId(authentication), id);
        return ApiResponse.ok(findArticle(id), "admin-article-update");
    }

    @PostMapping("/articles/{id}/publish")
    public ApiResponse<ArticleAdminView> publishArticle(Authentication authentication, @PathVariable long id) {
        ArticleAdminView existing = findArticle(id);
        ensureNotDeleted(existing.deleted());
        jdbc.update("update articles set status='PUBLISHED',published_at=current_timestamp(3),updated_by=? where id=?",
                actorId(authentication), id);
        return ApiResponse.ok(findArticle(id), "admin-article-publish");
    }

    @PostMapping("/articles/{id}/withdraw")
    public ApiResponse<ArticleAdminView> withdrawArticle(Authentication authentication, @PathVariable long id) {
        ArticleAdminView existing = findArticle(id);
        ensureNotDeleted(existing.deleted());
        if (!"PUBLISHED".equals(existing.status())) {
            throw new ConflictException("只有已发布文章可以撤回");
        }
        jdbc.update("update articles set status='WITHDRAWN',updated_by=? where id=?", actorId(authentication), id);
        return ApiResponse.ok(findArticle(id), "admin-article-withdraw");
    }

    @DeleteMapping("/articles/{id}")
    public ApiResponse<ArticleAdminView> deleteArticle(Authentication authentication, @PathVariable long id) {
        ArticleAdminView existing = findArticle(id);
        ensureNotDeleted(existing.deleted());
        long actorId = actorId(authentication);
        jdbc.update("update articles set deleted_at=current_timestamp(3),deleted_by=?,updated_by=? where id=?", actorId, actorId, id);
        return ApiResponse.ok(findArticle(id), "admin-article-delete");
    }

    @PostMapping("/articles/{id}/restore")
    public ApiResponse<ArticleAdminView> restoreArticle(Authentication authentication, @PathVariable long id) {
        ArticleAdminView existing = findArticle(id);
        if (!existing.deleted()) {
            throw new ConflictException("该文章不在回收站中");
        }
        jdbc.update("update articles set deleted_at=null,deleted_by=null,status='WITHDRAWN',updated_by=? where id=?",
                actorId(authentication), id);
        return ApiResponse.ok(findArticle(id), "admin-article-restore");
    }

    private CategoryAdminView categoryById(long id) {
        List<CategoryAdminView> result = jdbc.query(
                "select id,code,name,description,sort_order,enabled from categories where id=?",
                (rs, rowNum) -> new CategoryAdminView(rs.getLong("id"), rs.getString("code"), rs.getString("name"),
                        empty(rs.getString("description")), rs.getInt("sort_order"), rs.getBoolean("enabled")), id);
        if (result.isEmpty()) {
            throw new ResourceNotFoundException("分类不存在");
        }
        return result.get(0);
    }

    private ArtifactAdminView findArtifact(long id) {
        List<ArtifactAdminView> result = jdbc.query(
                "select a.id,a.category_id,a.accession_no,a.title,a.slug,a.period,a.material,a.dimensions,"
                        + "a.collection_location,a.cover_image_url,a.cover_asset_ref,a.summary,a.content,a.status,a.deleted_at,"
                        + "c.code category_code,c.name category_name from artifacts a join categories c on c.id=a.category_id where a.id=?",
                (rs, rowNum) -> artifactView(rs), id);
        if (result.isEmpty()) {
            throw new ResourceNotFoundException("文物不存在");
        }
        return result.get(0);
    }

    private ArticleAdminView findArticle(long id) {
        List<ArticleAdminView> result = jdbc.query(
                "select a.id,a.category_id,a.title,a.slug,a.cover_image_url,a.cover_asset_ref,a.summary,a.content,"
                        + "a.author_display,a.status,a.deleted_at,c.code category_code,c.name category_name "
                        + "from articles a join categories c on c.id=a.category_id where a.id=?",
                (rs, rowNum) -> articleView(rs), id);
        if (result.isEmpty()) {
            throw new ResourceNotFoundException("文章不存在");
        }
        return result.get(0);
    }

    private ArtifactAdminView artifactView(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new ArtifactAdminView(rs.getLong("id"), rs.getLong("category_id"), rs.getString("category_code"),
                rs.getString("category_name"), empty(rs.getString("accession_no")), rs.getString("title"), rs.getString("slug"),
                empty(rs.getString("period")), empty(rs.getString("material")), empty(rs.getString("dimensions")),
                empty(rs.getString("collection_location")), empty(rs.getString("cover_image_url")),
                empty(rs.getString("cover_asset_ref")), empty(rs.getString("summary")), rs.getString("content"),
                rs.getString("status"), rs.getTimestamp("deleted_at") != null);
    }

    private ArticleAdminView articleView(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new ArticleAdminView(rs.getLong("id"), rs.getLong("category_id"), rs.getString("category_code"),
                rs.getString("category_name"), rs.getString("title"), rs.getString("slug"),
                empty(rs.getString("cover_image_url")), empty(rs.getString("cover_asset_ref")), rs.getString("summary"),
                rs.getString("content"), empty(rs.getString("author_display")), rs.getString("status"),
                rs.getTimestamp("deleted_at") != null);
    }

    private void requireCategory(long id) {
        if (count("select count(*) from categories where id=?", id) != 1) {
            throw new ResourceNotFoundException("分类不存在");
        }
    }

    private void requireEnabledCategory(long id) {
        if (count("select count(*) from categories where id=? and enabled=1", id) != 1) {
            throw new ResourceNotFoundException("可用分类不存在");
        }
    }

    private long count(String sql, Object... values) {
        return jdbc.queryForObject(sql, Long.class, values);
    }

    private long actorId(Authentication authentication) {
        return (Long) authentication.getPrincipal();
    }

    private static void ensureNotDeleted(boolean deleted) {
        if (deleted) {
            throw new ConflictException("已删除内容只能先恢复");
        }
    }

    private static String blank(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String empty(String value) {
        return value == null ? "" : value;
    }

    public record CategoryAdminView(long id, String code, String name, String description, int sortOrder, boolean enabled) {
    }

    public record ArtifactAdminView(long id, long categoryId, String categoryCode, String categoryName,
                                    String accessionNo, String title, String slug, String period, String material,
                                    String dimensions, String collectionLocation, String coverImageUrl, String coverAssetRef,
                                    String summary, String content, String status, boolean deleted) {
    }

    public record ArticleAdminView(long id, long categoryId, String categoryCode, String categoryName,
                                   String title, String slug, String coverImageUrl, String coverAssetRef,
                                   String summary, String content, String authorDisplay, String status, boolean deleted) {
    }

    public record CategoryInput(
            @NotBlank @Pattern(regexp = "[A-Z0-9_]{2,32}") String code,
            @NotBlank @Size(max = 64) String name,
            @Size(max = 255) String description,
            @NotNull Integer sortOrder,
            @NotNull Boolean enabled) {
    }

    public record ArtifactInput(
            @NotNull Long categoryId,
            @Size(max = 64) String accessionNo,
            @NotBlank @Size(max = 150) String title,
            @NotBlank @Pattern(regexp = "[a-z0-9-]{3,180}") String slug,
            @Size(max = 100) String period,
            @Size(max = 100) String material,
            @Size(max = 150) String dimensions,
            @Size(max = 150) String collectionLocation,
            @Size(max = 500) String coverImageUrl,
            @Size(max = 128) String coverAssetRef,
            @Size(max = 500) String summary,
            @NotBlank String content) {
    }

    public record ArticleInput(
            @NotNull Long categoryId,
            @NotBlank @Size(max = 200) String title,
            @NotBlank @Pattern(regexp = "[a-z0-9-]{3,220}") String slug,
            @Size(max = 500) String coverImageUrl,
            @Size(max = 128) String coverAssetRef,
            @NotBlank @Size(max = 500) String summary,
            @NotBlank String content,
            @Size(max = 100) String authorDisplay) {
    }
}

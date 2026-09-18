package com.heluo.museum.content;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.audit.OperationLogService;
import com.heluo.museum.common.error.ConflictException;
import com.heluo.museum.common.error.ContentPage;
import com.heluo.museum.common.error.ResourceNotFoundException;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
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

/** Administrator-only lifecycle management for self-created 3D exhibits. */
@RestController
@RequestMapping("/api/v1/admin/exhibits")
public class AdminExhibitController {
    private final JdbcTemplate jdbc;
    private final OperationLogService audit;

    AdminExhibitController(JdbcTemplate jdbc, OperationLogService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @GetMapping
    public ApiResponse<ContentPage<AdminExhibitView>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "false") boolean deleted) {
        ArtifactController.PageRequest normalized = ArtifactController.PageRequest.of(page, size);
        String where = deleted ? " where e.deleted_at is not null" : " where e.deleted_at is null";
        long total = jdbc.queryForObject("select count(*) from exhibits_3d e" + where, Long.class);
        List<AdminExhibitView> items = jdbc.query(
                select() + where + " order by e.updated_at desc,e.id desc limit ? offset ?",
                (rs, rowNum) -> view(rs), normalized.size(), normalized.offset());
        return ApiResponse.ok(ContentPage.of(items, normalized.page(), normalized.size(), total), "admin-exhibits");
    }

    @GetMapping("/{id}")
    public ApiResponse<AdminExhibitView> detail(@PathVariable long id) {
        return ApiResponse.ok(find(id), "admin-exhibit");
    }

    @PostMapping
    @Transactional
    public ApiResponse<AdminExhibitView> create(Authentication authentication, @Valid @RequestBody ExhibitInput input) {
        requireValidMobileModel(input);
        requireUsableArtifact(input.artifactId());
        if (count("select count(*) from exhibits_3d where slug=? or model_source_ref=?", input.slug(), input.modelSourceRef()) > 0) {
            throw new ConflictException("展项 URL 标识或模型资产编号已存在");
        }
        long actorId = actorId(authentication);
        jdbc.update("insert into exhibits_3d(artifact_id,title,slug,summary,description,model_url,model_source_ref,model_format,"
                        + "model_size_bytes,mobile_model_url,mobile_model_size_bytes,cover_image_url,cover_asset_ref,display_no,source_credit,source_url,license_label,collection_location,created_by,updated_by) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                input.artifactId(), input.title(), input.slug(), blank(input.summary()), blank(input.description()), input.modelUrl(),
                input.modelSourceRef(), input.modelFormat(), input.modelSizeBytes(), blank(input.mobileModelUrl()), input.mobileModelSizeBytes(), blank(input.coverImageUrl()),
                blank(input.coverAssetRef()), blank(input.displayNo()), blank(input.sourceCredit()), blank(input.sourceUrl()),
                blank(input.licenseLabel()), blank(input.collectionLocation()), actorId, actorId);
        long id = jdbc.queryForObject("select id from exhibits_3d where slug=?", Long.class, input.slug());
        audit.record(actorId, "CONTENT", "EXHIBIT_CREATE", "EXHIBIT_3D", String.valueOf(id));
        return ApiResponse.ok(find(id), "admin-exhibit-create");
    }

    @PatchMapping("/{id}")
    @Transactional
    public ApiResponse<AdminExhibitView> update(Authentication authentication, @PathVariable long id,
                                                  @Valid @RequestBody ExhibitInput input) {
        requireValidMobileModel(input);
        AdminExhibitView existing = find(id);
        requireNotDeleted(existing.deleted());
        requireUsableArtifact(input.artifactId());
        if (count("select count(*) from exhibits_3d where (slug=? or model_source_ref=?) and id<>?",
                input.slug(), input.modelSourceRef(), id) > 0) {
            throw new ConflictException("展项 URL 标识或模型资产编号已存在");
        }
        long actorId = actorId(authentication);
        jdbc.update("update exhibits_3d set artifact_id=?,title=?,slug=?,summary=?,description=?,model_url=?,model_source_ref=?,"
                        + "model_format=?,model_size_bytes=?,mobile_model_url=?,mobile_model_size_bytes=?,cover_image_url=?,cover_asset_ref=?,display_no=?,source_credit=?,source_url=?,"
                        + "license_label=?,collection_location=?,updated_by=? where id=?",
                input.artifactId(), input.title(), input.slug(), blank(input.summary()), blank(input.description()), input.modelUrl(),
                input.modelSourceRef(), input.modelFormat(), input.modelSizeBytes(), blank(input.mobileModelUrl()), input.mobileModelSizeBytes(), blank(input.coverImageUrl()),
                blank(input.coverAssetRef()), blank(input.displayNo()), blank(input.sourceCredit()), blank(input.sourceUrl()),
                blank(input.licenseLabel()), blank(input.collectionLocation()), actorId, id);
        audit.record(actorId, "CONTENT", "EXHIBIT_UPDATE", "EXHIBIT_3D", String.valueOf(id));
        return ApiResponse.ok(find(id), "admin-exhibit-update");
    }

    @PostMapping("/{id}/publish")
    public ApiResponse<AdminExhibitView> publish(Authentication authentication, @PathVariable long id) {
        AdminExhibitView exhibit = find(id);
        requireNotDeleted(exhibit.deleted());
        if (!exhibit.artifactPublished()) {
            throw new ConflictException("关联文物尚未公开，不能发布 3D 展项");
        }
        long actorId = actorId(authentication);
        jdbc.update("update exhibits_3d set status='PUBLISHED',published_at=current_timestamp(3),updated_by=? where id=?", actorId, id);
        audit.record(actorId, "CONTENT", "EXHIBIT_PUBLISH", "EXHIBIT_3D", String.valueOf(id));
        return ApiResponse.ok(find(id), "admin-exhibit-publish");
    }

    @PostMapping("/{id}/withdraw")
    public ApiResponse<AdminExhibitView> withdraw(Authentication authentication, @PathVariable long id) {
        AdminExhibitView exhibit = find(id);
        requireNotDeleted(exhibit.deleted());
        if (!"PUBLISHED".equals(exhibit.status())) {
            throw new ConflictException("只有已发布展项可以撤回");
        }
        long actorId = actorId(authentication);
        jdbc.update("update exhibits_3d set status='WITHDRAWN',updated_by=? where id=?", actorId, id);
        audit.record(actorId, "CONTENT", "EXHIBIT_WITHDRAW", "EXHIBIT_3D", String.valueOf(id));
        return ApiResponse.ok(find(id), "admin-exhibit-withdraw");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<AdminExhibitView> delete(Authentication authentication, @PathVariable long id) {
        AdminExhibitView exhibit = find(id);
        requireNotDeleted(exhibit.deleted());
        long actorId = actorId(authentication);
        jdbc.update("update exhibits_3d set deleted_at=current_timestamp(3),deleted_by=?,updated_by=? where id=?", actorId, actorId, id);
        audit.record(actorId, "CONTENT", "EXHIBIT_DELETE", "EXHIBIT_3D", String.valueOf(id));
        return ApiResponse.ok(find(id), "admin-exhibit-delete");
    }

    @PostMapping("/{id}/restore")
    public ApiResponse<AdminExhibitView> restore(Authentication authentication, @PathVariable long id) {
        AdminExhibitView exhibit = find(id);
        if (!exhibit.deleted()) {
            throw new ConflictException("该展项不在回收站中");
        }
        long actorId = actorId(authentication);
        jdbc.update("update exhibits_3d set deleted_at=null,deleted_by=null,status='WITHDRAWN',updated_by=? where id=?", actorId, id);
        audit.record(actorId, "CONTENT", "EXHIBIT_RESTORE", "EXHIBIT_3D", String.valueOf(id));
        return ApiResponse.ok(find(id), "admin-exhibit-restore");
    }

    private AdminExhibitView find(long id) {
        List<AdminExhibitView> items = jdbc.query(select() + " where e.id=?", (rs, rowNum) -> view(rs), id);
        if (items.isEmpty()) {
            throw new ResourceNotFoundException("3D 展项不存在");
        }
        return items.get(0);
    }

    private static String select() {
        return "select e.id,e.artifact_id,e.title,e.slug,e.summary,e.description,e.model_url,e.model_source_ref,e.model_format,"
                + "e.model_size_bytes,e.mobile_model_url,e.mobile_model_size_bytes,e.cover_image_url,e.cover_asset_ref,e.display_no,e.source_credit,e.source_url,e.license_label,e.collection_location,e.status,e.deleted_at,a.title artifact_title,"
                + "(a.status='PUBLISHED' and a.deleted_at is null) artifact_published "
                + "from exhibits_3d e join artifacts a on a.id=e.artifact_id";
    }

    private static AdminExhibitView view(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new AdminExhibitView(rs.getLong("id"), rs.getLong("artifact_id"), rs.getString("artifact_title"),
                rs.getString("title"), rs.getString("slug"), empty(rs.getString("summary")), empty(rs.getString("description")),
                rs.getString("model_url"), rs.getString("model_source_ref"), rs.getString("model_format"),
                rs.getLong("model_size_bytes"), empty(rs.getString("mobile_model_url")), rs.getObject("mobile_model_size_bytes", Long.class),
                empty(rs.getString("cover_image_url")), empty(rs.getString("cover_asset_ref")),
                empty(rs.getString("display_no")), empty(rs.getString("source_credit")), empty(rs.getString("source_url")),
                empty(rs.getString("license_label")), empty(rs.getString("collection_location")), rs.getString("status"),
                rs.getTimestamp("deleted_at") != null, rs.getBoolean("artifact_published"));
    }

    private void requireUsableArtifact(long artifactId) {
        if (count("select count(*) from artifacts where id=? and deleted_at is null", artifactId) != 1) {
            throw new ResourceNotFoundException("关联文物不存在或已删除");
        }
    }

    private long count(String sql, Object... values) { return jdbc.queryForObject(sql, Long.class, values); }
    private static long actorId(Authentication authentication) { return (Long) authentication.getPrincipal(); }
    private static void requireNotDeleted(boolean deleted) { if (deleted) throw new ConflictException("已删除展项只能先恢复"); }
    private static void requireValidMobileModel(ExhibitInput input) {
        boolean hasUrl = blank(input.mobileModelUrl()) != null;
        boolean hasSize = input.mobileModelSizeBytes() != null;
        if (hasUrl != hasSize) throw new IllegalArgumentException("移动模型 URL 与文件大小必须同时填写或同时留空");
    }
    private static String blank(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static String empty(String value) { return value == null ? "" : value; }

    public record AdminExhibitView(long id, long artifactId, String artifactTitle, String title, String slug,
                                   String summary, String description, String modelUrl, String modelSourceRef,
                                   String modelFormat, long modelSizeBytes, String mobileModelUrl, Long mobileModelSizeBytes,
                                   String coverImageUrl, String coverAssetRef,
                                   String displayNo, String sourceCredit, String sourceUrl, String licenseLabel,
                                   String collectionLocation, String status, boolean deleted, boolean artifactPublished) { }

    public record ExhibitInput(
            @NotNull Long artifactId,
            @NotBlank @Size(max = 150) String title,
            @NotBlank @Pattern(regexp = "[a-z0-9-]{3,180}") String slug,
            @Size(max = 500) String summary,
            String description,
            @NotBlank @Size(max = 500) String modelUrl,
            @NotBlank @Size(max = 128) String modelSourceRef,
            @NotBlank @Pattern(regexp = "GLB|GLTF") String modelFormat,
            @NotNull @Min(1) Long modelSizeBytes,
            @Size(max = 500) String mobileModelUrl,
            @Min(1) Long mobileModelSizeBytes,
            @Size(max = 500) String coverImageUrl,
            @Size(max = 128) String coverAssetRef,
            @Size(max = 32) String displayNo,
            @Size(max = 255) String sourceCredit,
            @Size(max = 500) String sourceUrl,
            @Size(max = 128) String licenseLabel,
            @Size(max = 255) String collectionLocation) { }
}

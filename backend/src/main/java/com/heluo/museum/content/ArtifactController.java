package com.heluo.museum.content;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.error.ContentPage;
import com.heluo.museum.common.error.ResourceNotFoundException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/artifacts")
public class ArtifactController {
    private final JdbcTemplate jdbc;

    ArtifactController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public ApiResponse<ContentPage<Card>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String categoryCode,
            @RequestParam(required = false) String keyword) {
        PageRequest normalized = PageRequest.of(page, size);
        StringBuilder where = new StringBuilder(" where a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1");
        List<Object> arguments = new ArrayList<>();
        if (notBlank(categoryCode)) {
            where.append(" and c.code=?");
            arguments.add(categoryCode.trim());
        }
        if (notBlank(keyword)) {
            where.append(" and (a.title like ? or a.summary like ?)");
            String query = "%" + keyword.trim() + "%";
            arguments.add(query);
            arguments.add(query);
        }

        long total = jdbc.queryForObject("select count(*) from artifacts a join categories c on c.id=a.category_id" + where,
                Long.class, arguments.toArray());
        List<Object> listArguments = new ArrayList<>(arguments);
        listArguments.add(normalized.size());
        listArguments.add(normalized.offset());
        List<Card> items = jdbc.query(
                "select a.slug,a.title,a.summary,a.period,a.material,a.cover_image_url,c.code category_code,c.name category_name "
                        + "from artifacts a join categories c on c.id=a.category_id" + where
                        + " order by a.published_at desc,a.id desc limit ? offset ?",
                (rs, rowNum) -> new Card(rs.getString("slug"), rs.getString("title"),
                        nullable(rs.getString("summary")), nullable(rs.getString("period")),
                        nullable(rs.getString("material")), nullable(rs.getString("cover_image_url")),
                        rs.getString("category_code"), rs.getString("category_name")),
                listArguments.toArray());
        return ApiResponse.ok(ContentPage.of(items, normalized.page(), normalized.size(), total), "artifacts");
    }

    @GetMapping("/{slug}")
    public ApiResponse<Detail> detail(@PathVariable String slug) {
        List<Detail> details = jdbc.query(
                "select a.id,a.slug,a.title,a.summary,a.content,a.period,a.material,a.dimensions,a.collection_location,"
                        + "a.cover_image_url,c.code category_code,c.name category_name "
                        + "from artifacts a join categories c on c.id=a.category_id "
                        + "where a.slug=? and a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1",
                (rs, rowNum) -> new Detail(rs.getLong("id"), rs.getString("slug"), rs.getString("title"),
                        nullable(rs.getString("summary")), rs.getString("content"), nullable(rs.getString("period")),
                        nullable(rs.getString("material")), nullable(rs.getString("dimensions")),
                        nullable(rs.getString("collection_location")), nullable(rs.getString("cover_image_url")),
                        new Category(rs.getString("category_code"), rs.getString("category_name"))),
                slug);
        if (details.isEmpty()) {
            throw new ResourceNotFoundException("文物不存在或未发布");
        }
        Detail detail = details.get(0);
        List<ExhibitSummary> exhibits = jdbc.query(
                "select slug,title,summary,cover_image_url from exhibits_3d "
                        + "where artifact_id=? and status='PUBLISHED' and deleted_at is null order by published_at desc,id desc",
                (rs, rowNum) -> new ExhibitSummary(rs.getString("slug"), rs.getString("title"),
                        nullable(rs.getString("summary")), nullable(rs.getString("cover_image_url"))), detail.id());
        return ApiResponse.ok(detail.withExhibits(exhibits), "artifact");
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String nullable(String value) {
        return value == null ? "" : value;
    }

    record PageRequest(int page, int size) {
        static PageRequest of(int page, int size) {
            if (page < 1 || size < 1 || size > 100) {
                throw new IllegalArgumentException("page 必须大于 0，size 必须在 1 到 100 之间");
            }
            return new PageRequest(page, size);
        }

        int offset() {
            return (page - 1) * size;
        }
    }

    public record Card(String slug, String title, String summary, String period, String material,
                       String coverImageUrl, String categoryCode, String categoryName) {
    }

    public record Category(String code, String name) {
    }

    public record ExhibitSummary(String slug, String title, String summary, String coverImageUrl) {
    }

    public record Detail(long id, String slug, String title, String summary, String content, String period,
                         String material, String dimensions, String collectionLocation, String coverImageUrl,
                         Category category, List<ExhibitSummary> exhibits) {
        Detail(long id, String slug, String title, String summary, String content, String period, String material,
               String dimensions, String collectionLocation, String coverImageUrl, Category category) {
            this(id, slug, title, summary, content, period, material, dimensions, collectionLocation,
                    coverImageUrl, category, List.of());
        }

        Detail withExhibits(List<ExhibitSummary> publicExhibits) {
            return new Detail(id, slug, title, summary, content, period, material, dimensions, collectionLocation,
                    coverImageUrl, category, publicExhibits);
        }
    }
}

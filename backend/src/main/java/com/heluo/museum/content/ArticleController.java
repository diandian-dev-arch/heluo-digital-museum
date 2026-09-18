package com.heluo.museum.content;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.error.ContentPage;
import com.heluo.museum.common.error.ResourceNotFoundException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/articles")
public class ArticleController {
    private final JdbcTemplate jdbc;

    ArticleController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public ApiResponse<ContentPage<Card>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String categoryCode,
            @RequestParam(required = false) String keyword) {
        ArtifactController.PageRequest normalized = ArtifactController.PageRequest.of(page, size);
        StringBuilder where = new StringBuilder(" where a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1");
        List<Object> arguments = new ArrayList<>();
        if (notBlank(categoryCode)) {
            where.append(" and c.code=?");
            arguments.add(categoryCode.trim());
        }
        if (keyword != null) {
            where.append(" and ").append(ContentSearch.PREDICATE);
            String query = ContentSearch.pattern(keyword);
            arguments.add(query);
            arguments.add(query);
            arguments.add(query);
            arguments.add(query);
        }
        long total = jdbc.queryForObject("select count(*) from articles a join categories c on c.id=a.category_id" + where,
                Long.class, arguments.toArray());
        List<Object> listArguments = new ArrayList<>(arguments);
        listArguments.add(normalized.size());
        listArguments.add(normalized.offset());
        List<Card> items = jdbc.query(
                "select a.slug,a.title,a.summary,a.title_en,a.summary_en,a.cover_image_url,a.author_display,c.code category_code,c.name category_name "
                        + "from articles a join categories c on c.id=a.category_id" + where
                        + " order by a.published_at desc,a.id desc limit ? offset ?",
                (rs, rowNum) -> new Card(rs.getString("slug"), rs.getString("title"), rs.getString("summary"),
                        empty(rs.getString("cover_image_url")), empty(rs.getString("author_display")),
                        rs.getString("category_code"), rs.getString("category_name"), rs.getString("title_en"), rs.getString("summary_en")),
                listArguments.toArray());
        return ApiResponse.ok(ContentPage.of(items, normalized.page(), normalized.size(), total), "articles");
    }

    @GetMapping("/{slug}")
    public ApiResponse<Detail> detail(@PathVariable String slug) {
        List<Detail> details = jdbc.query(
                "select a.slug,a.title,a.summary,a.title_en,a.summary_en,a.content,a.cover_image_url,a.author_display,a.published_at,"
                        + "c.code category_code,c.name category_name from articles a join categories c on c.id=a.category_id "
                        + "where a.slug=? and a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1",
                (rs, rowNum) -> new Detail(rs.getString("slug"), rs.getString("title"), rs.getString("summary"),
                        rs.getString("content"), empty(rs.getString("cover_image_url")), empty(rs.getString("author_display")),
                        new Category(rs.getString("category_code"), rs.getString("category_name")), rs.getString("title_en"), rs.getString("summary_en")), slug);
        if (details.isEmpty()) {
            throw new ResourceNotFoundException("文章不存在或未发布");
        }
        return ApiResponse.ok(details.get(0), "article");
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String empty(String value) {
        return value == null ? "" : value;
    }

    public record Card(String slug, String title, String summary, String coverImageUrl, String authorDisplay,
                       String categoryCode, String categoryName, String titleEn, String summaryEn) {
    }

    public record Category(String code, String name) {
    }

    public record Detail(String slug, String title, String summary, String content, String coverImageUrl,
                         String authorDisplay, Category category, String titleEn, String summaryEn) {
    }
}

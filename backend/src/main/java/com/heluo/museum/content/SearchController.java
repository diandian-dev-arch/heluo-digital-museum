package com.heluo.museum.content;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.error.ContentPage;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/search")
public class SearchController {
    private final JdbcTemplate jdbc;

    SearchController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public ApiResponse<ContentPage<Result>> search(@RequestParam String keyword,
                                                    @RequestParam(defaultValue = "all") String type,
                                                    @RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "20") int size) {
        if (keyword == null || keyword.isBlank()) {
            throw new IllegalArgumentException("keyword 不能为空");
        }
        if (!List.of("all", "artifact", "article").contains(type)) {
            throw new IllegalArgumentException("type 必须是 all、artifact 或 article");
        }
        ArtifactController.PageRequest normalized = ArtifactController.PageRequest.of(page, size);
        String query = "%" + keyword.trim() + "%";
        List<Result> allResults = new ArrayList<>();
        if (!"article".equals(type)) {
            allResults.addAll(jdbc.query(
                    "select a.slug,a.title,a.summary,a.cover_image_url,c.name category_name from artifacts a "
                            + "join categories c on c.id=a.category_id where a.status='PUBLISHED' and a.deleted_at is null "
                            + "and c.enabled=1 and (a.title like ? or a.summary like ?) order by a.published_at desc,a.id desc",
                    (rs, rowNum) -> new Result("artifact", rs.getString("slug"), rs.getString("title"),
                            empty(rs.getString("summary")), empty(rs.getString("cover_image_url")), rs.getString("category_name")),
                    query, query));
        }
        if (!"artifact".equals(type)) {
            allResults.addAll(jdbc.query(
                    "select a.slug,a.title,a.summary,a.cover_image_url,c.name category_name from articles a "
                            + "join categories c on c.id=a.category_id where a.status='PUBLISHED' and a.deleted_at is null "
                            + "and c.enabled=1 and (a.title like ? or a.summary like ?) order by a.published_at desc,a.id desc",
                    (rs, rowNum) -> new Result("article", rs.getString("slug"), rs.getString("title"),
                            empty(rs.getString("summary")), empty(rs.getString("cover_image_url")), rs.getString("category_name")),
                    query, query));
        }
        int from = Math.min(normalized.offset(), allResults.size());
        int to = Math.min(from + normalized.size(), allResults.size());
        return ApiResponse.ok(ContentPage.of(allResults.subList(from, to), normalized.page(), normalized.size(),
                allResults.size()), "search");
    }

    private static String empty(String value) {
        return value == null ? "" : value;
    }

    public record Result(String type, String slug, String title, String summary, String coverImageUrl,
                         String categoryName) {
    }
}

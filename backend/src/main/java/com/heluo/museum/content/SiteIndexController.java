package com.heluo.museum.content;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;
import org.springframework.web.util.UriUtils;

/** Public discovery documents share the application's published-content boundary. */
@RestController
public class SiteIndexController {
    private final JdbcTemplate jdbc;
    private final String baseUrl;

    SiteIndexController(JdbcTemplate jdbc,
            @Value("${museum.mail.public-base-url}") String publicBaseUrl) {
        this.jdbc = jdbc;
        URI uri = URI.create(publicBaseUrl);
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null
                || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))) {
            throw new IllegalArgumentException("MUSEUM_PUBLIC_BASE_URL must be an HTTP(S) origin without credentials");
        }
        this.baseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    @GetMapping(value = "/robots.txt", produces = "text/plain;charset=UTF-8")
    public String robots() {
        return "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /profile\n"
                + "Disallow: /login\nDisallow: /reset-password\n\nSitemap: " + baseUrl + "/sitemap.xml\n";
    }

    @GetMapping(value = "/sitemap.xml", produces = "application/xml;charset=UTF-8")
    public String sitemap() {
        List<String> paths = new ArrayList<>(List.of("/", "/explore", "/exhibits", "/appointment", "/shop"));
        append(paths, "/artifacts/", "select a.slug from artifacts a join categories c on c.id=a.category_id "
                + "where a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1 order by a.slug");
        append(paths, "/articles/", "select a.slug from articles a join categories c on c.id=a.category_id "
                + "where a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1 order by a.slug");
        append(paths, "/exhibits/", "select e.slug from exhibits_3d e join artifacts a on a.id=e.artifact_id join categories c on c.id=a.category_id "
                + "where e.status='PUBLISHED' and e.deleted_at is null "
                + "and a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1 order by e.slug");
        StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        for (String path : paths) {
            xml.append("  <url><loc>").append(HtmlUtils.htmlEscape(baseUrl + path)).append("</loc></url>\n");
        }
        return xml.append("</urlset>\n").toString();
    }

    private void append(List<String> paths, String prefix, String sql) {
        jdbc.queryForList(sql, String.class)
                .forEach(slug -> paths.add(prefix + UriUtils.encodePathSegment(slug, StandardCharsets.UTF_8)));
    }
}

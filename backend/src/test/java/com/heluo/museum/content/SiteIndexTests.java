package com.heluo.museum.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.io.StringReader;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.xml.sax.InputSource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.profiles.active=test,pocketbay",
    "spring.datasource.url=jdbc:h2:mem:site-index;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
    "museum.mail.public-base-url=https://museum.example",
    "museum.bootstrap.enabled=true",
    "museum.bootstrap.admin-username=index_test_admin",
    "museum.bootstrap.admin-password=TestIndexPassword123",
    "museum.bootstrap.admin-email=index@example.test"
})
@AutoConfigureMockMvc
@Transactional
class SiteIndexTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestRestTemplate http;

    @Test
    void servletContainerServesDiscoveryAndSuppressesHeadBody() {
        var getResponse = http.getForEntity("/sitemap.xml", String.class);
        assertThat(getResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(getResponse.getBody()).contains("https://museum.example/");
        var headResponse = http.exchange("/sitemap.xml", HttpMethod.HEAD, null, String.class);
        assertThat(headResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(headResponse.getBody()).isNull();
        assertThat(headResponse.getHeaders().getContentType().toString()).startsWith("application/xml");
        assertThat(http.getForEntity("/robots.txt", String.class).getBody())
                .contains("Sitemap: https://museum.example/sitemap.xml");
    }

    @Test
    void anonymousDiscoveryUsesAbsoluteUrlsAndParsesAsXml() throws Exception {
        String xml = mvc.perform(get("/sitemap.xml")).andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/xml"))
                .andReturn().getResponse().getContentAsString();
        var factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        var nodes = factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)))
                .getElementsByTagName("loc");
        assertThat(nodes.getLength()).isGreaterThan(5);
        for (int i = 0; i < nodes.getLength(); i++) {
            assertThat(nodes.item(i).getTextContent()).startsWith("https://museum.example/");
        }
        assertThat(xml).doesNotContain("/admin", "/profile", "/login");
        mvc.perform(get("/robots.txt")).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Sitemap: https://museum.example/sitemap.xml")));
        // MockMvc does not apply the servlet container's HEAD body suppression.
        mvc.perform(head("/sitemap.xml")).andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/xml"));
        mvc.perform(head("/robots.txt")).andExpect(status().isOk());
        mvc.perform(post("/sitemap.xml")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/orders")).andExpect(status().isUnauthorized());
    }

    @Test
    void withdrawnAndDeletedContentImmediatelyLeaveTheIndex() throws Exception {
        String slug = jdbc.queryForObject("select slug from artifacts where status='PUBLISHED' limit 1", String.class);
        jdbc.update("update artifacts set status='DRAFT' where slug=?", slug);
        String xml = mvc.perform(get("/sitemap.xml")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(xml).doesNotContain("/artifacts/" + slug + "</loc>");
        jdbc.update("update articles set deleted_at=CURRENT_TIMESTAMP");
        xml = mvc.perform(get("/sitemap.xml")).andReturn().getResponse().getContentAsString();
        assertThat(xml).doesNotContain("/articles/");
    }
}

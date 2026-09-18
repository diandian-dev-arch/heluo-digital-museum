package com.heluo.museum.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "spring.profiles.active=test,pocketbay",
        "spring.datasource.url=jdbc:h2:mem:museum-static-cache;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE"
})
@AutoConfigureMockMvc
class StaticResourceCacheConfigurationTests {
    @Autowired
    MockMvc mvc;

    @Test
    void hashedAssetsAreImmutableForGetAndHead() throws Exception {
        mvc.perform(get("/assets/app-abcdefgh.js"))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control"))
                        .contains("max-age=31536000", "public", "immutable"));
        mvc.perform(head("/assets/app-abcdefgh.js"))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control")).contains("immutable"));
    }

    @Test
    void versionedMediaSupportsImmutableRangeRequests() throws Exception {
        mvc.perform(get("/media/model-v5.5.glb").header("Range", "bytes=0-3"))
                .andExpect(status().isPartialContent())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control")).contains("immutable"))
                .andExpect(result -> assertThat(result.getResponse().getHeader("Content-Range")).startsWith("bytes 0-3/"));
        mvc.perform(head("/media/model-v5.5-mobile.glb"))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control")).contains("immutable"));
    }

    @Test
    void unversionedMediaAndFaviconUseShortPublicCaching() throws Exception {
        mvc.perform(get("/media/poster.webp"))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control"))
                        .contains("max-age=86400", "public").doesNotContain("immutable"))
                .andExpect(header().exists("Last-Modified"));
        mvc.perform(head("/favicon.svg"))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control")).contains("max-age=86400"));
    }

    @Test
    void htmlRevalidatesAndMissingResourcesAreNeverPubliclyCached() throws Exception {
        mvc.perform(get("/index.html"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-cache, must-revalidate"));
        mvc.perform(get("/exhibits/fixture"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"))
                .andExpect(header().string("Cache-Control", "no-cache, must-revalidate"));
        var missing = mvc.perform(get("/assets/missing-abcdefgh.js"))
                .andExpect(status().isNotFound())
                .andReturn().getResponse();
        assertThat(missing.getHeader("Cache-Control")).doesNotContain("public", "immutable");
    }

    @Test
    void apiResponsesRemainNoStoreAndPrivateHeadStaysProtected() throws Exception {
        mvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store"));
        mvc.perform(get("/api/v1/exhibits"))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store"));
        mvc.perform(head("/api/v1/orders"))
                .andExpect(status().isUnauthorized())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store"));
    }

    @Test
    void authenticationStateEndpointRequiresAuthenticationAndRemainsNoStore() throws Exception {
        mvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(result -> assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store"))
                .andExpect(result -> assertThat(result.getResponse().getContentAsString()).contains("AUTH_REQUIRED"));
    }

    @Test
    void unknownPublicPagesRenderTheSpaWithoutOpeningApiOrManagementPaths() throws Exception {
        mvc.perform(get("/unknown/page"))
                .andExpect(status().isNotFound())
                .andExpect(forwardedUrl("/index.html"));
        mvc.perform(get("/api/v1/unknown"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/env"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/assets/missing.js"))
                .andExpect(status().isNotFound());
    }
}

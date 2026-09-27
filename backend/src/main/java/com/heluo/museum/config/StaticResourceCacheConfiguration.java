package com.heluo.museum.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import java.io.IOException;
import java.time.Duration;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.Ordered;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class StaticResourceCacheConfiguration implements WebMvcConfigurer {
    private static final Pattern HASHED_ASSET = Pattern.compile(".*-[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9]+$");
    private static final Pattern VERSIONED_MEDIA = Pattern.compile(
            ".*(?:[-_.]v\\d+(?:[.-]\\d+)*(?:[-_.][A-Za-z0-9]+)*|@\\d+x)\\.[A-Za-z0-9]+$");
    private static final String IMMUTABLE = CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable().getHeaderValue();
    private static final String SHORT = CacheControl.maxAge(Duration.ofDays(1)).cachePublic().getHeaderValue();
    private static final String HTML = "no-cache, must-revalidate";

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/assets/**").addResourceLocations("classpath:/static/assets/");
        registry.addResourceHandler("/media/**").addResourceLocations("classpath:/static/media/");
        registry.addResourceHandler("/favicon.svg").addResourceLocations("classpath:/static/");
    }

    @Bean
    FilterRegistrationBean<OncePerRequestFilter> responseCacheControlFilter() {
        var registration = new FilterRegistrationBean<OncePerRequestFilter>();
        registration.setFilter(new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                    throws ServletException, IOException {
                response.setHeader("Cache-Control", cacheControl(request));
                chain.doFilter(request, response);
            }
        });
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    private static String cacheControl(HttpServletRequest request) {
        String method = request.getMethod();
        if (!("GET".equals(method) || "HEAD".equals(method))) {
            return "no-store";
        }
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if ("/index.html".equals(path) && exists(path)) {
            return HTML;
        }
        if (!(path.startsWith("/assets/") || path.startsWith("/media/") || "/favicon.svg".equals(path))
                || !exists(path)) {
            return "no-store";
        }
        String lowerPath = path.toLowerCase(Locale.ROOT);
        boolean immutable = path.startsWith("/assets/")
                ? HASHED_ASSET.matcher(path).matches()
                : path.startsWith("/media/") && VERSIONED_MEDIA.matcher(lowerPath).matches();
        return immutable ? IMMUTABLE : SHORT;
    }

    private static boolean exists(String path) {
        return !path.contains("..") && new ClassPathResource("static" + path).isReadable();
    }
}

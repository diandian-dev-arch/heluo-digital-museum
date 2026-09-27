package com.heluo.museum.config;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
@Profile("pocketbay")
public class PocketBaySpaController {
    static boolean isPublicPageRequest(HttpServletRequest request) {
        String method = request.getMethod();
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return ("GET".equals(method) || "HEAD".equals(method))
                && path.matches("^/(?!api(?:/|$)|actuator(?:/|$)|assets(?:/|$)|media(?:/|$))[^.]+$");
    }

    @GetMapping("/{section:^(?!api$|actuator$|assets$|media$)[^.]+}/**")
    public String unknownPage(HttpServletResponse response) {
        response.setStatus(HttpServletResponse.SC_NOT_FOUND);
        response.setHeader("Cache-Control", "no-cache, must-revalidate");
        return "forward:/index.html";
    }

    @GetMapping({
            "/", "/explore", "/artifacts/{slug}", "/articles/{slug}",
            "/exhibits", "/exhibits/{slug}", "/appointment", "/shop",
            "/login", "/reset-password", "/profile", "/admin", "/admin/operations"
    })
    public String index(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-cache, must-revalidate");
        return "forward:/index.html";
    }
}

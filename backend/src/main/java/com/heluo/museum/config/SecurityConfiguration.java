package com.heluo.museum.config;

import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import com.heluo.museum.auth.JwtAuthenticationFilter;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@Configuration
@EnableWebSecurity
public class SecurityConfiguration {
    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JwtAuthenticationFilter jwtAuthenticationFilter,
                                            RestAuthenticationEntryPoint authenticationEntryPoint,
                                            RestAccessDeniedHandler accessDeniedHandler) throws Exception {
        return http
                .cors(cors -> {})
                .csrf(csrf -> csrf.disable())
                .headers(headers -> headers.cacheControl(cache -> cache.disable()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers("/api/v1/health", "/api/v1/ready", "/actuator/health").permitAll()
                        .requestMatchers(HttpMethod.GET, "/robots.txt", "/sitemap.xml").permitAll()
                        .requestMatchers(HttpMethod.HEAD, "/robots.txt", "/sitemap.xml").permitAll()
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/auth/register", "/api/v1/auth/login",
                                "/api/v1/auth/password-reset/request",
                                "/api/v1/auth/password-reset/confirm").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/", "/index.html", "/favicon.ico", "/favicon.svg", "/assets/**", "/media/**",
                                "/explore", "/artifacts/*", "/articles/*", "/exhibits", "/exhibits/*",
                                "/appointment", "/shop", "/login", "/reset-password", "/profile",
                                "/admin", "/admin/operations").permitAll()
                        .requestMatchers(HttpMethod.HEAD,
                                "/", "/index.html", "/favicon.ico", "/favicon.svg", "/assets/**", "/media/**",
                                "/explore", "/artifacts/*", "/articles/*", "/exhibits", "/exhibits/*",
                                "/appointment", "/shop", "/login", "/reset-password", "/profile",
                                "/admin", "/admin/operations").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/categories/**", "/api/v1/artifacts/**", "/api/v1/articles/**",
                                "/api/v1/exhibits/**", "/api/v1/products/**", "/api/v1/search",
                                "/api/v1/appointment-slots/**").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        .requestMatchers(PocketBaySpaController::isPublicPageRequest).permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}




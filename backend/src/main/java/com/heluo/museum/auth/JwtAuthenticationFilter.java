package com.heluo.museum.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.heluo.museum.common.error.ApiError;
import com.heluo.museum.common.web.RequestCorrelationFilter;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.List;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataAccessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
  private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
  private final JdbcTemplate jdbc; private final String secret;
  private final ObjectMapper mapper;
  public JwtAuthenticationFilter(JdbcTemplate jdbc,@Value("${museum.security.jwt-secret:}") String secret,ObjectMapper mapper){this.jdbc=jdbc;this.secret=secret;this.mapper=mapper;}
  @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws java.io.IOException,jakarta.servlet.ServletException {
    String header=request.getHeader("Authorization");
    if(header!=null&&header.startsWith("Bearer ")&&secret.length()>=32) try {
      SecretKey key=Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)); Claims c=Jwts.parser().verifyWith(key).build().parseSignedClaims(header.substring(7)).getPayload();
      long id=Long.parseLong(c.getSubject()); String jti=c.getId();
      Integer active=jdbc.queryForObject("select count(*) from auth_sessions s join users u on u.id=s.user_id where s.id=? and s.user_id=? and s.revoked_at is null and s.expires_at>current_timestamp(3) and u.status='ACTIVE' and u.deleted_at is null",Integer.class,jti,id);
      if(active!=null&&active==1){List<String> roles=jdbc.queryForList("select r.code from roles r join user_roles ur on ur.role_id=r.id where ur.user_id=?",String.class,id); var authorities=roles.stream().map(r->new SimpleGrantedAuthority("ROLE_"+r)).toList(); SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(id,null,authorities));}
    } catch(JwtException | IllegalArgumentException ignored) {
      SecurityContextHolder.clearContext();
    } catch(DataAccessException exception) {
      SecurityContextHolder.clearContext();
      log.warn("Authentication dependency unavailable: reason={}", exception.getClass().getSimpleName());
      response.setStatus(503);
      response.setContentType("application/json;charset=UTF-8");
      mapper.writeValue(response.getOutputStream(), new ApiError("SERVICE_UNAVAILABLE", "服务暂时不可用，请稍后重试",
              List.of(), RequestCorrelationFilter.currentId()));
      return;
    }
    chain.doFilter(request,response);
  }
}

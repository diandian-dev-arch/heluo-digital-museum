package com.heluo.museum.auth;

import io.jsonwebtoken.Claims;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
  private final JdbcTemplate jdbc; private final String secret;
  public JwtAuthenticationFilter(JdbcTemplate jdbc,@Value("${museum.security.jwt-secret:}") String secret){this.jdbc=jdbc;this.secret=secret;}
  @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws java.io.IOException,jakarta.servlet.ServletException {
    String header=request.getHeader("Authorization");
    if(header!=null&&header.startsWith("Bearer ")&&secret.length()>=32) try {
      SecretKey key=Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)); Claims c=Jwts.parser().verifyWith(key).build().parseSignedClaims(header.substring(7)).getPayload();
      long id=Long.parseLong(c.getSubject()); String jti=c.getId();
      Integer active=jdbc.queryForObject("select count(*) from auth_sessions s join users u on u.id=s.user_id where s.id=? and s.user_id=? and s.revoked_at is null and s.expires_at>current_timestamp(3) and u.status='ACTIVE' and u.deleted_at is null",Integer.class,jti,id);
      if(active!=null&&active==1){List<String> roles=jdbc.queryForList("select r.code from roles r join user_roles ur on ur.role_id=r.id where ur.user_id=?",String.class,id); var authorities=roles.stream().map(r->new SimpleGrantedAuthority("ROLE_"+r)).toList(); SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(id,null,authorities));}
    } catch(Exception ignored) { SecurityContextHolder.clearContext(); }
    chain.doFilter(request,response);
  }
}

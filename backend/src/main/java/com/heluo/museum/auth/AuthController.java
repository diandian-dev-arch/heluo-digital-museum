package com.heluo.museum.auth;

import com.heluo.museum.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/auth")
public class AuthController {
  private final JdbcTemplate jdbc; private final JwtService jwt; private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
  AuthController(JdbcTemplate jdbc, JwtService jwt) { this.jdbc=jdbc; this.jwt=jwt; }
  @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED)
  public ApiResponse<Map<String,Object>> register(@Valid @RequestBody Register body) {
    if (jdbc.queryForObject("select count(*) from users where username=?", Integer.class, body.username()) > 0) throw new IllegalArgumentException("用户名已存在");
    jdbc.update("insert into users(username,password_hash,nickname,email,phone) values(?,?,?,?,?)", body.username(),encoder.encode(body.password()),body.nickname(),blank(body.email()),blank(body.phone()));
    Long id=jdbc.queryForObject("select id from users where username=?",Long.class,body.username());
    jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='USER'",id);
    return ApiResponse.ok(Map.of("id",id,"username",body.username(),"nickname",body.nickname(),"roles",new String[]{"USER"}),"register");
  }
  @PostMapping("/login")
  public ApiResponse<Map<String,Object>> login(@Valid @RequestBody Login body) {
    var row=jdbc.queryForMap("select id,password_hash,status,nickname from users where username=? and deleted_at is null",body.username());
    if (!"ACTIVE".equals(row.get("status")) || !encoder.matches(body.password(),(String)row.get("password_hash"))) throw new IllegalArgumentException("用户名或密码错误");
    long id=((Number)row.get("id")).longValue(); var token=jwt.issue(id); jdbc.update("insert into auth_sessions(id,user_id,expires_at) values(?,?,?)",token.id(),id,Timestamp.from(token.expiresAt())); jdbc.update("update users set last_login_at=current_timestamp(3) where id=?",id);
    return ApiResponse.ok(Map.of("accessToken",token.value(),"expiresAt",token.expiresAt().toString(),"user",Map.of("id",id,"username",body.username(),"nickname",row.get("nickname"),"roles",new String[]{"USER"})),"login");
  }
  @GetMapping("/me")
  public ApiResponse<Map<String,Object>> me(org.springframework.security.core.Authentication auth) {
    long id=(Long)auth.getPrincipal(); var row=jdbc.queryForMap("select username,nickname,email,phone,status from users where id=?",id);
    var roles=jdbc.queryForList("select r.code from roles r join user_roles ur on ur.role_id=r.id where ur.user_id=?",String.class,id);
    return ApiResponse.ok(Map.of("id",id,"username",row.get("username"),"nickname",row.get("nickname"),"email",row.get("email")==null?"":row.get("email"),"phone",row.get("phone")==null?"":row.get("phone"),"status",row.get("status"),"roles",roles),"me");
  }
  @PostMapping("/logout")
  public ApiResponse<Map<String,String>> logout(org.springframework.security.core.Authentication auth,@RequestHeader("Authorization") String header) {
    String token=header.substring(7); String jti=io.jsonwebtoken.Jwts.parser().verifyWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(jwt.secretBytes())).build().parseSignedClaims(token).getPayload().getId();
    jdbc.update("update auth_sessions set revoked_at=current_timestamp(3) where id=? and user_id=?",jti,(Long)auth.getPrincipal()); return ApiResponse.ok(Map.of("status","logged_out"),"logout");
  }  private String blank(String value){return value==null||value.isBlank()?null:value.trim();}
  public record Register(@NotBlank @Pattern(regexp="[A-Za-z0-9_]{3,32}") String username,@NotBlank @Size(min=8,max=72) String password,@NotBlank @Size(max=50) String nickname,@jakarta.validation.constraints.Email String email,@Size(max=20) String phone){}
  public record Profile(@NotBlank @Size(max=50) String nickname,@jakarta.validation.constraints.Email String email,@Size(max=20) String phone){}
  public record Login(@NotBlank String username,@NotBlank String password){}
}




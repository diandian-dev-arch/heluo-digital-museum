package com.heluo.museum.auth;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
  private final String secret;
  public JwtService(@Value("${museum.security.jwt-secret:}") String secret) { this.secret = secret; }
  public Token issue(long userId) {
    if (secret.length() < 32) throw new IllegalStateException("MUSEUM_JWT_SECRET must be at least 32 characters");
    String id = UUID.randomUUID().toString(); Instant expires = Instant.now().plus(8, ChronoUnit.HOURS);
    SecretKey key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    String token = Jwts.builder().subject(String.valueOf(userId)).id(id).expiration(java.util.Date.from(expires)).signWith(key).compact();
    return new Token(id, token, expires);
  }
  public record Token(String id, String value, Instant expiresAt) {}
}

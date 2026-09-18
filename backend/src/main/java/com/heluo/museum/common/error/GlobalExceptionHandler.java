package com.heluo.museum.common.error;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import com.heluo.museum.common.web.RequestCorrelationFilter;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ApiError> validation(MethodArgumentNotValidException e, HttpServletRequest request) {
    var errors=e.getBindingResult().getFieldErrors().stream().map(x->new ApiError.FieldError(x.getField(),x.getDefaultMessage())).toList();
    return response(HttpStatus.UNPROCESSABLE_ENTITY,"VALIDATION_ERROR","请求参数不合法",errors,request);
  }
  @ExceptionHandler({IllegalArgumentException.class,ConstraintViolationException.class})
  ResponseEntity<ApiError> badRequest(Exception e,HttpServletRequest request) { return response(HttpStatus.UNPROCESSABLE_ENTITY,"VALIDATION_ERROR",e.getMessage(),List.of(),request); }
  @ExceptionHandler({org.springframework.dao.IncorrectResultSizeDataAccessException.class, com.heluo.museum.auth.AuthController.InvalidCredentialsException.class})
  ResponseEntity<ApiError> credentials(HttpServletRequest request) { return response(HttpStatus.UNAUTHORIZED,"INVALID_CREDENTIALS","用户名或密码错误",List.of(),request); }
  @ExceptionHandler({ResourceNotFoundException.class, EmptyResultDataAccessException.class})
  ResponseEntity<ApiError> notFound(Exception e, HttpServletRequest request) {
    return response(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "资源不存在或暂不可见", List.of(), request);
  }
  @ExceptionHandler(ConflictException.class)
  ResponseEntity<ApiError> conflict(ConflictException e, HttpServletRequest request) {
    return response(HttpStatus.CONFLICT, e.code(), e.getMessage(), List.of(), request);
  }
  @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,
      org.springframework.web.bind.MissingRequestHeaderException.class,
      org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
  ResponseEntity<ApiError> malformed(Exception e, HttpServletRequest request) {
    return response(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "请求参数不合法", List.of(), request);
  }
  @ExceptionHandler(DataAccessException.class)
  ResponseEntity<ApiError> unavailable(DataAccessException e, HttpServletRequest request) {
    log.warn("API dependency unavailable: reason={}", e.getClass().getSimpleName());
    return response(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务暂时不可用，请稍后重试", List.of(), request);
  }
  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiError> unexpected(Exception e, HttpServletRequest request) {
    if (e instanceof org.springframework.web.ErrorResponse error) {
      return ResponseEntity.status(error.getStatusCode()).body(new ApiError("HTTP_" + error.getStatusCode().value(),
          "请求地址、方法或参数不合法", List.of(), RequestCorrelationFilter.currentId()));
    }
    log.error("API request failed: reason={}", e.getClass().getSimpleName());
    return response(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务暂时无法完成请求，请稍后重试", List.of(), request);
  }
  private ResponseEntity<ApiError> response(HttpStatus status,String code,String message,List<ApiError.FieldError> errors,HttpServletRequest request){return ResponseEntity.status(status).body(new ApiError(code,message,errors,RequestCorrelationFilter.currentId()));}
}


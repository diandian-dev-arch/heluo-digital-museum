package com.heluo.museum.common.error;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ApiError> validation(MethodArgumentNotValidException e, HttpServletRequest request) {
    var errors=e.getBindingResult().getFieldErrors().stream().map(x->new ApiError.FieldError(x.getField(),x.getDefaultMessage())).toList();
    return response(HttpStatus.UNPROCESSABLE_ENTITY,"VALIDATION_ERROR","请求参数不合法",errors,request);
  }
  @ExceptionHandler({IllegalArgumentException.class,ConstraintViolationException.class})
  ResponseEntity<ApiError> badRequest(Exception e,HttpServletRequest request) { return response(HttpStatus.UNPROCESSABLE_ENTITY,"VALIDATION_ERROR",e.getMessage(),List.of(),request); }
  @ExceptionHandler(org.springframework.dao.IncorrectResultSizeDataAccessException.class)
  ResponseEntity<ApiError> credentials(HttpServletRequest request) { return response(HttpStatus.UNAUTHORIZED,"INVALID_CREDENTIALS","用户名或密码错误",List.of(),request); }
  private ResponseEntity<ApiError> response(HttpStatus status,String code,String message,List<ApiError.FieldError> errors,HttpServletRequest request){String id=request.getHeader("X-Request-Id");return ResponseEntity.status(status).body(new ApiError(code,message,errors,id==null?UUID.randomUUID().toString():id));}
}


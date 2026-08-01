package com.heluo.museum.content;
import com.heluo.museum.common.api.ApiResponse;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/search") public class SearchController {
 private final JdbcTemplate jdbc; SearchController(JdbcTemplate jdbc){this.jdbc=jdbc;}
 @GetMapping public ApiResponse<List<Result>> search(@RequestParam @NotBlank String keyword,@RequestParam(defaultValue="all") String type){String q="%"+keyword.trim()+"%"; var r=new java.util.ArrayList<Result>();if(!"article".equals(type))r.addAll(jdbc.query("select slug,title,summary from artifacts where status='PUBLISHED' and deleted_at is null and (title like ? or summary like ?)",(rs,n)->new Result("artifact",rs.getString(1),rs.getString(2),rs.getString(3)),q,q));if(!"artifact".equals(type))r.addAll(jdbc.query("select slug,title,summary from articles where status='PUBLISHED' and deleted_at is null and (title like ? or summary like ?)",(rs,n)->new Result("article",rs.getString(1),rs.getString(2),rs.getString(3)),q,q));return ApiResponse.ok(r,"search");}
 public record Result(String type,String slug,String title,String summary){}
}

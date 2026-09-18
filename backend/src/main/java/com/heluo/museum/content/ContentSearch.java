package com.heluo.museum.content;

import java.util.Locale;

/** Shared literal, case-insensitive matching for public content endpoints. */
final class ContentSearch {
    private ContentSearch() {}

    static final String PREDICATE = "(lower(coalesce(a.title,'')) like ? escape '!'"
            + " or lower(coalesce(a.summary,'')) like ? escape '!'"
            + " or lower(coalesce(a.title_en,'')) like ? escape '!'"
            + " or lower(coalesce(a.summary_en,'')) like ? escape '!')";

    static String pattern(String keyword) {
        if (keyword == null || keyword.isBlank()) throw new IllegalArgumentException("keyword 不能为空");
        String value = keyword.trim();
        if (value.length() > 100) throw new IllegalArgumentException("keyword 不能超过 100 个字符");
        return "%" + value.toLowerCase(Locale.ROOT).replace("!", "!!")
                .replace("%", "!%").replace("_", "!_") + "%";
    }
}

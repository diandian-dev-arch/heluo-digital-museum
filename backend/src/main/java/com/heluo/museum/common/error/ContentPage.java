package com.heluo.museum.common.error;

import java.util.List;

/** Shared response shape for public and administration list endpoints. */
public record ContentPage<T>(List<T> items, int page, int size, long total, int totalPages) {
    public static <T> ContentPage<T> of(List<T> items, int page, int size, long total) {
        int totalPages = total == 0 ? 0 : (int) Math.ceil((double) total / size);
        return new ContentPage<>(items, page, size, total, totalPages);
    }
}

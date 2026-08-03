package com.heluo.museum.common.error;

/** Returned when a write conflicts with the current persisted state. */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}

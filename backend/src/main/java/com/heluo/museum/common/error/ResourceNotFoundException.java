package com.heluo.museum.common.error;

/** Returned when a resource is not visible to the current caller. */
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message);
    }
}

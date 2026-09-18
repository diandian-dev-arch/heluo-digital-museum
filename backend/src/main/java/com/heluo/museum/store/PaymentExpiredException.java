package com.heluo.museum.store;

import com.heluo.museum.common.error.ConflictException;

/** The expiry state must commit before the HTTP layer reports a payment conflict. */
public final class PaymentExpiredException extends ConflictException {
    public PaymentExpiredException() {
        super("ORDER_PAYMENT_EXPIRED", "订单支付已超时");
    }
}

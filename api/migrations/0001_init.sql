
CREATE TABLE homes (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    CONSTRAINT homes_pk PRIMARY KEY (id)
);

CREATE TABLE members (
    member_order INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    home_id TEXT NOT NULL,
    name TEXT NOT NULL,
    CONSTRAINT members_home_fk
        FOREIGN KEY (home_id) REFERENCES homes(id)
);

CREATE TABLE bills (
    id TEXT NOT NULL,
    home_id TEXT NOT NULL,
    title TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    CONSTRAINT bills_pk PRIMARY KEY (id),
    CONSTRAINT bills_positive_amount
        CHECK (total_cents > 0),
    CONSTRAINT bills_home_fk
        FOREIGN KEY (home_id) REFERENCES homes(id)
);

CREATE TABLE shares (
    id TEXT NOT NULL,
    bill_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    paid_at TEXT DEFAULT NULL,
    idempotency_key TEXT DEFAULT NULL,
    CONSTRAINT shares_pk PRIMARY KEY (id),
    CONSTRAINT shares_positive_amount
        CHECK (amount_cents >= 0),
    CONSTRAINT shares_bill_fk
        FOREIGN KEY (bill_id) REFERENCES bills(id),
    CONSTRAINT shares_member_fk
        FOREIGN KEY (member_id) REFERENCES members(id),
    CONSTRAINT unique_bill_member
        UNIQUE (bill_id, member_id)
);

from enum import StrEnum


class Role(StrEnum):
    CUSTOMER = "customer"
    PARTNER = "partner"
    RECYCLER = "recycler"
    ADMIN = "admin"


class VerificationStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class PickupStatus(StrEnum):
    REQUESTED = "requested"
    ASSIGNED = "assigned"
    ACCEPTED = "accepted"
    ON_THE_WAY = "on_the_way"
    ARRIVED = "arrived"
    COLLECTED = "collected"
    VERIFIED = "verified"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


PICKUP_FLOW = [
    PickupStatus.REQUESTED,
    PickupStatus.ASSIGNED,
    PickupStatus.ACCEPTED,
    PickupStatus.ON_THE_WAY,
    PickupStatus.ARRIVED,
    PickupStatus.COLLECTED,
    PickupStatus.VERIFIED,
    PickupStatus.COMPLETED,
]


class PickupPurpose(StrEnum):
    RECYCLE = "recycle"
    DONATE = "donate"  # books, clothes, toys in usable condition → schools / NGOs


class AssignmentStatus(StrEnum):
    OFFERED = "offered"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class SegregationQuality(StrEnum):
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


class TxnType(StrEnum):
    EARN = "earn"
    REDEEM = "redeem"
    ADJUST = "adjust"


class TxnStatus(StrEnum):
    PENDING = "pending"
    CREDITED = "credited"
    FULFILLED = "fulfilled"
    CANCELLED = "cancelled"


class OrderStatus(StrEnum):
    REQUESTED = "requested"
    APPROVED = "approved"
    DISPATCHED = "dispatched"
    RECEIVED = "received"
    PROCESSED = "processed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class StreakKind(StrEnum):
    LEARNING = "learning"
    SEGREGATION = "segregation"

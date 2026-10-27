import {
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { buildingConditionEnum, ownershipStatusEnum } from "./enums";
import { communities, organizations, users } from "./tenancy";

export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    name: text("name").notNull(),
    code: text("code").notNull(),
    unitCount: integer("unit_count"),
    yearBuilt: integer("year_built"),
    roofCondition: buildingConditionEnum("roof_condition")
      .notNull()
      .default("unknown"),
    stairwellCondition: buildingConditionEnum("stairwell_condition")
      .notNull()
      .default("unknown"),
    sidingCondition: buildingConditionEnum("siding_condition")
      .notNull()
      .default("unknown"),
    balconyCondition: buildingConditionEnum("balcony_condition")
      .notNull()
      .default("unknown"),
    waterIntrusionStatus: buildingConditionEnum("water_intrusion_status")
      .notNull()
      .default("unknown"),
    electricalStatus: buildingConditionEnum("electrical_status")
      .notNull()
      .default("unknown"),
    insuranceIssueStatus: buildingConditionEnum("insurance_issue_status")
      .notNull()
      .default("unknown"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("buildings_community_code").on(t.communityId, t.code),
  ],
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id),
    unitNumber: text("unit_number").notNull(),
    bedrooms: numeric("bedrooms", { precision: 4, scale: 1 }),
    bathrooms: numeric("bathrooms", { precision: 4, scale: 1 }),
    sqFt: numeric("sq_ft", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("units_building_number").on(t.buildingId, t.unitNumber),
  ],
);

export const unitOwners = pgTable("unit_owners", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  userId: uuid("user_id").references(() => users.id),
  displayName: text("display_name").notNull(),
  status: ownershipStatusEnum("status").notNull().default("unknown"),
  ownedFrom: date("owned_from"),
  ownedTo: date("owned_to"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

# Garner: Smart Grocery Price Comparison — Business & Product Specification

## 1. Product Overview

### Product vision

A crowdsourced grocery price comparison application that helps people:

1. discover the best prices for everyday products;
2. build shopping lists at home;
3. determine the best supermarket or combination of supermarkets for the entire list;
4. navigate the shopping trip using a shopping mode;
5. record actual prices while shopping;
6. automatically contribute those observations back to the community;
7. track spending and price history over time.

The core product principle is:

> **Crowdsourcing should happen as a natural side effect of shopping, not as a separate task the user is forced to perform.**

### Core product loop

```text
Create shopping list
        ↓
Compare current prices
        ↓
Optimize where/how to buy
        ↓
Choose route
        ↓
Shop using Shopping Mode
        ↓
Record actual prices
        ↓
Track running spending
        ↓
Store price observations
        ↓
Improve community price data
        ↓
Improve future recommendations
```

---

# 2. Product Principles

## 2.1 User value first

Every contribution request should be attached to an action the user already wants to complete.

Bad pattern:

> "Please contribute a price to help the community."

Preferred pattern:

> "Enter the price you just paid so you can track your spending."

The contribution happens automatically.

## 2.2 Price data should be useful, not merely abundant

The product should prefer recent and trustworthy observations over simply showing the largest quantity of observations.

Prices should always be interpreted with context such as:

- recency;
- supermarket;
- product;
- source;
- whether the observation came from an actual purchase;
- optional supporting evidence such as a photo.

## 2.3 Optimization should be understandable

The application may perform complex optimization internally, but the user should see simple outcomes such as:

- Cheapest
- Best balance
- Simplest

The user should understand *why* an option is recommended.

## 2.4 The user controls the trade-off

Different users value different things.

One user may prefer:

> Spend as little as possible.

Another may prefer:

> Avoid visiting more than two supermarkets.

Another may prefer:

> Stay within 5 km of home.

The application should make these trade-offs configurable.

---

# 3. Primary Personas / Use Cases

## Everyday shopper

Wants to know where to buy normal groceries for the lowest reasonable cost.

## Budget-conscious shopper

Wants the cheapest combination of products and stores.

## Time-conscious shopper

Wants to minimize the number of stops and total travel.

## Regular shopper

Frequently buys similar products and benefits from reusable lists, price history, alerts, and preferences.

## Community contributor

Occasionally reports prices or consistently records purchases while shopping, improving the shared price database.

---

# 4. High-Level Application Areas

The application consists of these business areas:

```text
HOME
SEARCH
PRODUCTS
PRICE COMPARISON
SHOPPING LISTS
SHOPPING MODE
SMART OPTIMIZATION
SUPERMARKETS / MAP
CROWDSOURCING
PRICE HISTORY
ALERTS
PROFILE / PREFERENCES
```

---

# 5. First-Time User Flow

## 5.1 Welcome

The user sees the core value proposition:

> Find the best prices for your daily shopping.

Primary actions:

- Sign up
- Log in

## 5.2 Account creation

Supported high-level options:

- Google
- Apple
- Email

The user may also log in from this screen.

## 5.3 Location

The application asks for a location because location influences:

- nearby supermarkets;
- available prices;
- route recommendations;
- optimization results.

The user may:

- allow location access;
- enter a location manually.

## 5.4 Interests

Optional onboarding information can help personalize the home screen.

Examples:

- Dairy
- Beverages
- Snacks
- Fruits
- Vegetables
- Meat
- Cleaning
- Personal care

This should remain optional.

## 5.5 Tutorial / first-use guidance

The application introduces the core loop:

> Search → Compare → Save → Shop → Track

The user can skip the tutorial.

---

# 6. Global Navigation

Primary navigation:

```text
Home
Search
Lists
Alerts
Profile
```

Global navigation should remain simple and focused on the main recurring actions.

---

# 7. Home

## Purpose

The home screen is the user's starting point for discovering useful information quickly.

## Main content

Possible sections:

### Nearby

Shows relevant products and supermarkets near the user.

### Best deals for you

Prioritized based on:

- location;
- preferred categories;
- recent activity;
- tracked products;
- current price opportunities.

### Price drops

Shows products whose current price appears meaningfully lower than their recent historical price.

### Active shopping list

If a list exists, surface an easy action to continue it.

### Shopping recommendation

Potential CTA:

> Optimize my shopping

This takes the user directly from an existing list into the optimization flow.

---

# 8. Product Search

## Purpose

Allow a user to find a product before, during, or after shopping.

Users can:

- search by product name;
- search by brand;
- browse categories;
- use recent searches;
- scan a barcode;
- manually enter product information when necessary.

Search results should prioritize clarity over excessive detail.

Example:

```text
Milk 1L
La Serenísima
Average price: €1.32
From €1.25 nearby
```

---

# 9. Product Detail

Every product should have a product-centered page.

## Information

Possible sections:

- product identity;
- image;
- brand;
- category;
- average current price;
- lowest known nearby price;
- supermarkets carrying the product;
- current price comparison;
- price history;
- add to shopping list;
- track price;
- report price.

## Main actions

### Add to list

Adds the product to a selected shopping list.

### Track price

The user can request notifications when the price reaches a threshold or meaningfully changes.

### Report price

Starts the explicit crowdsourcing flow.

### Compare prices

Shows available prices by supermarket.

---

# 10. Price Comparison

## Purpose

Show where a single product can be purchased.

Example:

```text
Milk 1L

Carrefour      €1.25
Día            €1.29
Coto           €1.35
Jumbo          €1.45
Vea            €1.46
Disco          €1.50
```

Each price should communicate enough context to support a decision.

Possible context:

- distance;
- price recency;
- source;
- confidence;
- promotion indicator where applicable.

## User actions

- view supermarket;
- view map;
- add product to list;
- report a different price;
- track price.

---

# 11. Shopping Lists

Shopping lists are a central product concept.

## 11.1 List creation

The user can create a list with:

- list name;
- products;
- quantities;
- optional notes.

Examples:

- Weekly groceries
- Weekend shopping
- Party
- Monthly household

## 11.2 List detail

Each item can contain:

- product;
- quantity;
- expected price;
- actual price;
- selected supermarket;
- purchased status.

Example:

```text
□ Milk 1L             €1.25
□ Bread 500g          €0.89
□ Eggs 12             €2.10
□ Banana 1kg          €1.30
```

## 11.3 List actions

The user can:

- add item;
- remove item;
- edit quantity;
- mark purchased;
- view total;
- sort;
- group by supermarket;
- share;
- duplicate;
- export;
- delete;
- optimize where to buy.

---

# 12. Smart Shopping Optimization

This is one of the product's core differentiators.

## User goal

Given a shopping list, answer:

> **Where should I buy everything?**

The system should consider product prices and store constraints and return understandable alternatives.

## Example

Shopping list:

```text
Milk
Bread
Eggs
Chicken
Bananas
Rice
Tomatoes
Cheese
```

Possible results:

### Cheapest

```text
Día + Carrefour + Jumbo

Total: €34.90
Savings: €8.90
Extra distance: +5.7 km
Extra time: +25 min
```

### Best balance

```text
Carrefour + Día

Total: €37.20
Savings: €6.60
Extra distance: +1.8 km
Extra time: +8 min
```

### Simplest

```text
Carrefour

Total: €43.80
Savings: €0
Extra distance: 0
Extra time: 0
```

---

# 13. Optimization Preferences

The user should be able to configure the recommendation.

## Main parameters

### Maximum supermarkets

Example:

```text
1 / 2 / 3 / ...
```

### Maximum additional distance

Example:

```text
5 km
```

### Maximum additional travel time

Example:

```text
20 minutes
```

### Minimum savings required to justify another store

Example:

```text
€4
```

### Optimization preference

Options:

- Cheapest
- Best balance
- Simplest

### Preferred supermarkets

The user may indicate stores they prefer or want to exclude.

These preferences should be reusable.

---

# 14. Optimization Business Rules

The system should:

1. identify which selected products are available at which supermarkets;
2. evaluate price totals for candidate supermarket combinations;
3. evaluate travel implications;
4. respect the user's constraints;
5. identify uncovered products;
6. rank viable alternatives;
7. present a small number of understandable recommendations.

## Important behavior

The system should not recommend a cheaper plan if it violates explicit user constraints.

Example:

```text
User maximum supermarkets = 2

A three-store solution may be cheaper
but must not be shown as the preferred valid solution.
```

A potentially useful additional option is:

> Show excluded cheaper alternatives.

This allows transparency without overriding the user's constraints.

---

# 15. Route Preview

After selecting an optimization result, the user can view the route.

Example:

```text
HOME
  ↓
1. Carrefour
   4 products
   €24.20
  ↓
2. Día
   4 products
   €13.00
```

The route view should show:

- store order;
- products assigned to each store;
- expected spending at each store;
- total spending;
- approximate travel;
- route map.

---

# 16. Shopping Mode

Shopping Mode is a dedicated experience for when the user is physically shopping.

## Purpose

Allow the user to:

- follow the list;
- confirm products as they find them;
- record actual prices;
- see a running total;
- contribute data naturally.

## Example

```text
CARREFOUR

✓ Milk 1L           €1.25
✓ Bread 500g        €0.89
✓ Eggs 12           €2.10

□ Chicken           Enter price
□ Tomatoes          Enter price

Current total       €4.24
```

## Main principle

The user should not be required to provide a price if the known current price is considered reliable.

The user can confirm or adjust it.

Example:

```text
Expected price: €1.25

Actual price:
[ €1.32 ]

Save
```

This allows the application to learn from reality.

---

# 17. Barcode Scanning

Barcode scanning should be available both:

- during normal product discovery;
- during Shopping Mode.

## Scan flow

```text
Scan barcode
    ↓
Identify product
    ↓
Find expected price/store
    ↓
Confirm or enter actual price
    ↓
Mark product purchased
```

If the barcode cannot be identified:

```text
Barcode not recognized

→ Search manually
→ Enter product information
→ Continue shopping
```

---

# 18. Crowdsourcing

There are two principal contribution mechanisms.

# 18.1 Explicit price report

Flow:

```text
Search product
      ↓
Report price
      ↓
Select supermarket
      ↓
Enter price
      ↓
Optional photo
      ↓
Submit
```

Use cases:

- user sees an interesting price while shopping;
- user wants to correct outdated information;
- user wants to contribute without using a shopping list.

# 18.2 Shopping-based contribution

Flow:

```text
Shopping list
      ↓
Shopping Mode
      ↓
User enters/confirms price
      ↓
Actual purchase observation recorded
```

This should be the preferred crowdsourcing mechanism because it is directly connected to a genuine purchase.

---

# 19. Price Observation

A price observation is conceptually a record of:

```text
Product
Supermarket
Price
Time
User context/source
Optional evidence
```

Possible sources include:

- supermarket-provided price;
- user-reported price;
- actual purchase;
- user purchase with photo;
- other trusted sources added later.

The product should keep historical observations rather than replacing them with a single current value.

---

# 20. Price Reliability / Confidence

The application should internally evaluate how trustworthy a price appears.

Relevant signals may include:

- source type;
- observation age;
- number of confirming observations;
- consistency with recent observations;
- whether the price was recorded during an actual shopping session;
- whether supporting evidence exists.

The UI can translate this into simple user language:

```text
Very recent
Recently verified
Likely current
Possibly outdated
```

Avoid exposing a confusing raw score in the MVP unless necessary.

---

# 21. Price History

Users should be able to see historical product pricing.

Example:

```text
Milk 1L

30 days
90 days
6 months
1 year
```

Possible summary:

```text
Current price       €1.25
Average             €1.32
Lowest              €1.18
Trend               -5%
```

History can support:

- purchasing decisions;
- price tracking;
- detection of price drops;
- trust in the platform.

---

# 22. Alerts

Users can track products or shopping-related conditions.

Examples:

- price falls below threshold;
- significant price drop;
- tracked product becomes cheaper nearby;
- reminder for a shopping list;
- shopping-list price changes.

Example:

```text
Milk 1L

Notify me when price is below:
[ €1.10 ]
```

Alerts should remain opt-in.

---

# 23. Nearby Supermarkets

The user can browse supermarkets near them.

Each store can show:

- distance;
- current availability where known;
- relevant prices;
- open/closed state where reliable;
- products matching the current list;
- store location on a map.

For the shopping list context, the store page should emphasize:

> How useful is this store for *my list*?

rather than only generic supermarket information.

---

# 24. Map Experience

Maps should be used as a supporting decision tool rather than the primary interface.

Important contexts:

- nearby supermarkets;
- product price locations;
- optimized shopping route;
- store sequence for a shopping list.

The map should answer practical questions such as:

> Which stores do I need to visit?

and:

> How much extra travel am I accepting for this saving?

---

# 25. Shopping List Analytics

The user should be able to understand spending over time.

Possible information:

- total spent;
- average shopping trip;
- spending by category;
- spending by supermarket;
- price trends;
- savings versus the previous period.

Example:

```text
This month

Spent                    €245.30

Top stores
Carrefour                €120.40
Día                       €78.10
Jumbo                     €46.80
```

This is a secondary feature and should not dominate the initial product experience.

---

# 26. Profile and Preferences

Possible areas:

- profile;
- location;
- preferred supermarkets;
- optimization preferences;
- notification settings;
- currency/unit preferences;
- contribution history;
- help and support;
- about.

---

# 27. Offline Behavior — Business Requirement

The app should remain useful when connectivity is temporarily poor.

In particular, the user should be able to continue a shopping session and avoid losing already-entered prices.

Expected behavior:

```text
Online
  ↓
Load shopping list
  ↓
Enter prices while shopping
  ↓
Temporary connection loss
  ↓
Continue shopping
  ↓
Data retained
  ↓
Reconnect
  ↓
Observations synchronized
```

The user should receive clear feedback when information is waiting to synchronize.

---

# 28. Core Business Entities

At the business level, the application revolves around:

```text
User
Product
Product Category
Supermarket
Store Location
Price Observation
Price History
Shopping List
Shopping List Item
Shopping Session
Shopping Route
Optimization Preference
Price Alert
```

The conceptual relationships are:

```text
User
 ├── Shopping Lists
 ├── Shopping Sessions
 ├── Price Reports
 ├── Price Alerts
 └── Preferences

Shopping List
 ├── Shopping List Items
 ├── Optimization Request
 └── Shopping Sessions

Shopping Session
 └── Actual Purchase Prices

Product
 ├── Price Observations
 ├── Price History
 └── Shopping List Items

Supermarket
 ├── Store Locations
 ├── Product Prices
 └── Shopping Routes
```

---

# 29. Important Business Distinctions

## Product vs price

A product is not a price.

A product can have:

- many supermarkets;
- many prices;
- many observations;
- changing prices over time.

## Expected price vs actual price

A shopping list may contain an expected price before the trip.

A shopping session may record an actual price during the trip.

These should remain conceptually distinct.

```text
Expected:
€1.25

Actual:
€1.32
```

The difference itself is valuable information.

## Price observation vs current price

A current price is a derived business view.

A price observation is a historical event.

This distinction allows the application to maintain history, reliability, and traceability.

---

# 30. Recommended Primary User Journeys

## Journey A — Single product comparison

```text
Home
 ↓
Search
 ↓
Product
 ↓
Compare prices
 ↓
Choose supermarket
```

## Journey B — Build and optimize a list

```text
Home
 ↓
Create list
 ↓
Add products
 ↓
Optimize
 ↓
Choose:
  Cheapest
  Best balance
  Simplest
 ↓
View route
 ↓
Start shopping
```

## Journey C — Shopping-mode crowdsourcing

```text
Shopping list
 ↓
Start Shopping Mode
 ↓
Find product
 ↓
Confirm / enter actual price
 ↓
Mark purchased
 ↓
Repeat
 ↓
Finish shopping
 ↓
Prices become observations
```

## Journey D — Explicit contribution

```text
Search
 ↓
Product
 ↓
Report price
 ↓
Select store
 ↓
Enter price
 ↓
Optional evidence
 ↓
Submit
```

## Journey E — Track a product

```text
Product
 ↓
Track price
 ↓
Set threshold
 ↓
Receive alert
 ↓
Open product
 ↓
Add to list / buy
```

---

# 31. MVP Scope

The first release should focus on the core product loop.

## MVP — Must Have

- account creation / login;
- location;
- product search;
- product detail;
- supermarket prices from initial known sources;
- shopping lists;
- add/remove/edit list items;
- single-product price comparison;
- smart list optimization;
- configurable maximum supermarkets;
- route preview;
- Shopping Mode;
- manual price entry;
- barcode scanning;
- automatic shopping-session price observations;
- explicit price reporting;
- basic price history;
- basic alerts;
- basic offline continuity for shopping mode.

## MVP — Nice to Have

- shopping analytics;
- extensive personalization;
- advanced recommendation ranking;
- sophisticated confidence explanations;
- list sharing;
- exports;
- recurring lists;
- advanced route preferences.

## Later

- loyalty/promotional integration;
- richer personalization;
- household/shared accounts;
- advanced predictive price analysis;
- more sophisticated optimization;
- merchant partnerships;
- additional external data sources.

---

# 32. Business Success Metrics

The product should be measured primarily by whether it helps users save money and complete shopping efficiently.

Useful metrics include:

## Activation

- percentage of new users creating a first shopping list;
- percentage performing a first price comparison;
- percentage completing a first shopping session.

## Engagement

- lists created per active user;
- shopping sessions per user;
- products added per list;
- repeated list usage.

## Crowdsourcing

- price observations per shopping session;
- percentage of purchased items with recorded actual prices;
- percentage of observations later confirmed by another source/user.

## Product value

- estimated savings shown;
- estimated savings selected;
- actual price vs expected price;
- optimization adoption rate;
- percentage of users choosing multi-store recommendations.

## Retention

- users returning for another shopping trip;
- recurring weekly usage;
- tracked products;
- alert engagement.

---

# 33. High-Level Frontend Framework Direction

This document intentionally stays at the business/product layer.

The current high-level frontend direction is:

```text
React Native
+
Expo
+
TypeScript
+
Expo Router
```

The frontend should provide:

- mobile-first UX;
- reliable navigation;
- barcode scanning;
- maps/location;
- notifications;
- offline continuity;
- fast data fetching and caching.

No lower-level infrastructure or implementation decisions are defined here.

---

# 34. Agent-Oriented Implementation Guidance

An implementation agent should treat this document as a **product contract**, not merely a list of screens.

## Implementation order

Recommended order:

```text
1. Product / supermarket / price concepts
2. Product discovery
3. Shopping lists
4. Single-product comparison
5. List optimization
6. Shopping route
7. Shopping Mode
8. Price observations
9. Price history
10. Alerts
11. Analytics / refinement
```

## Agent behavior requirements

Before implementing a feature, the agent should answer:

1. What user problem does this solve?
2. Which business entity or flow does it affect?
3. What is the expected user outcome?
4. What happens when required information is missing?
5. What happens when the user changes their mind?
6. Does the feature create or update price knowledge?
7. Does it affect shopping-list totals?
8. Does it affect optimization results?

## Avoid

The implementation should avoid:

- creating screens without a defined user goal;
- exposing technical complexity to users;
- asking for crowdsourcing when the user is already providing equivalent information naturally;
- treating a price as permanently valid;
- recommending a cheaper route that violates explicit user constraints;
- making the optimization process opaque.

---

# 35. Guiding Product Concept

The application should ultimately feel like:

> **A personal shopping assistant powered by a community-maintained price map.**

The user comes for savings.

They stay because the application makes shopping easier.

The community becomes stronger because everyday shopping automatically creates useful price information.

---

# 36. Final End-to-End Flow

```text
                    ┌───────────────┐
                    │   ONBOARDING  │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │     HOME      │
                    └───────┬───────┘
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
         Search Product              Create List
              ↓                           ↓
       Product Detail               Add Products
              ↓                           ↓
       Price Comparison              Optimize
              ↓                           ↓
        Add to List              Cheapest / Balanced /
                                      Simplest
                                           ↓
                                      Route Preview
                                           ↓
                                      Shopping Mode
                                           ↓
                                 Confirm / Enter Prices
                                           ↓
                                  Running Total
                                           ↓
                                Finish Shopping
                                           ↓
                                  Price Observations
                                           ↓
                                  Price History
                                           ↓
                               Better Recommendations
                                           ↓
                                  Better User Value
```

---

# 37. One-Sentence Product Definition

> **A crowdsourced grocery shopping assistant that compares prices, optimizes where to shop, guides the user while shopping, and continuously improves its price intelligence from real purchases.**

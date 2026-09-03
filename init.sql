CREATE DATABASE core_db;
CREATE DATABASE pricing_db;
CREATE DATABASE intelligence_db;

-- Integration tests run against their own databases so a test run can
-- truncate freely without touching development data.
CREATE DATABASE core_db_test;
CREATE DATABASE pricing_db_test;
CREATE DATABASE intelligence_db_test;

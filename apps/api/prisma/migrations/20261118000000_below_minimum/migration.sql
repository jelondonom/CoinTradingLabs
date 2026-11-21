-- D-01 (DEF-001): orden por debajo del monto mínimo de 10 USD.
-- En PostgreSQL 17, ADD VALUE puede ir dentro de una transacción, pero el valor nuevo solo se
-- puede usar después del commit. Esta migración no lo usa.
ALTER TYPE "order_reject_reason" ADD VALUE 'below_minimum' AFTER 'invalid_quantity';

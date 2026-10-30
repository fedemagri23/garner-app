-- Diet and lifestyle labels (gluten-free, vegan, ...), filterable in search.
ALTER TABLE "products" ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "products_labels_idx" ON "products" USING GIN ("labels");

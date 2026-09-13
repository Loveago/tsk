import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Ensure environment variables from .env and .env.local are loaded into process.env
function loadEnvFile(fileName: string) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch (e) {
    console.warn(`Could not read ${fileName}:`, e);
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@clickyfied.com").trim();
  const adminPassword = (process.env.ADMIN_PASSWORD || "admin123").trim();
  const adminName = (process.env.ADMIN_NAME || "Admin").trim();
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // Admin user: check if admin with this email exists
  let existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  // If not found and a previous default admin exists, update that account to the new email
  if (!existingAdmin && adminEmail !== "admin@clickyfied.com") {
    const defaultAdmin = await prisma.user.findUnique({
      where: { email: "admin@clickyfied.com" },
    });
    if (defaultAdmin) {
      existingAdmin = defaultAdmin;
    }
  }

  const admin = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          name: adminName,
          email: adminEmail,
          passwordHash,
          role: "ADMIN",
          status: "ACTIVE",
        },
      })
    : await prisma.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          passwordHash,
          role: "ADMIN",
          status: "ACTIVE",
          balance: 0,
        },
      });

  // Default pricing profile
  const defaultProfile = await prisma.pricingProfile.upsert({
    where: { name: "Default Retail" },
    update: {},
    create: {
      name: "Default Retail",
      type: "RETAIL",
      active: true,
      isDefault: true,
      tiers: {
        create: [
          { gbAmount: 1, priceGHS: 3.5 },
          { gbAmount: 2, priceGHS: 6.5 },
          { gbAmount: 3, priceGHS: 9.0 },
          { gbAmount: 4, priceGHS: 12.0 },
          { gbAmount: 5, priceGHS: 15.0 },
          { gbAmount: 10, priceGHS: 28.0 },
        ],
      },
    },
  });

  // Reseller profile
  await prisma.pricingProfile.upsert({
    where: { name: "Reseller" },
    update: {},
    create: {
      name: "Reseller",
      type: "RESELLER",
      active: true,
      isDefault: false,
      tiers: {
        create: [
          { gbAmount: 1, priceGHS: 3.0 },
          { gbAmount: 2, priceGHS: 5.5 },
          { gbAmount: 3, priceGHS: 8.0 },
          { gbAmount: 4, priceGHS: 10.5 },
          { gbAmount: 5, priceGHS: 13.0 },
          { gbAmount: 10, priceGHS: 24.0 },
        ],
      },
    },
  });

  // Data packages
  const packages = [
    { network: "MTN", name: "MTN 1GB", gbAmount: 1, providerProductId: "MTN-1GB", retailPriceGHS: 3.5, sortOrder: 1 },
    { network: "MTN", name: "MTN 2GB", gbAmount: 2, providerProductId: "MTN-2GB", retailPriceGHS: 6.5, sortOrder: 2 },
    { network: "MTN", name: "MTN 3GB", gbAmount: 3, providerProductId: "MTN-3GB", retailPriceGHS: 9.0, sortOrder: 3 },
    { network: "MTN", name: "MTN 4GB", gbAmount: 4, providerProductId: "MTN-4GB", retailPriceGHS: 12.0, sortOrder: 4 },
    { network: "MTN", name: "MTN 5GB", gbAmount: 5, providerProductId: "MTN-5GB", retailPriceGHS: 15.0, sortOrder: 5 },
    { network: "MTN", name: "MTN 10GB", gbAmount: 10, providerProductId: "MTN-10GB", retailPriceGHS: 28.0, sortOrder: 6 },
    { network: "TELECEL", name: "Telecel 1GB", gbAmount: 1, providerProductId: "TLC-1GB", retailPriceGHS: 3.4, sortOrder: 7 },
    { network: "TELECEL", name: "Telecel 2GB", gbAmount: 2, providerProductId: "TLC-2GB", retailPriceGHS: 6.2, sortOrder: 8 },
    { network: "TELECEL", name: "Telecel 5GB", gbAmount: 5, providerProductId: "TLC-5GB", retailPriceGHS: 14.5, sortOrder: 9 },
    { network: "AIRTELTIGO", name: "AirtelTigo 1GB", gbAmount: 1, providerProductId: "AT-1GB", retailPriceGHS: 3.2, sortOrder: 10 },
    { network: "AIRTELTIGO", name: "AirtelTigo 2GB", gbAmount: 2, providerProductId: "AT-2GB", retailPriceGHS: 6.0, sortOrder: 11 },
    { network: "AIRTELTIGO", name: "AirtelTigo 5GB", gbAmount: 5, providerProductId: "AT-5GB", retailPriceGHS: 14.0, sortOrder: 12 },
  ];

  for (const pkg of packages) {
    await prisma.dataPackage.upsert({
      where: { network_gbAmount: { network: pkg.network, gbAmount: pkg.gbAmount } },
      update: { retailPriceGHS: pkg.retailPriceGHS, name: pkg.name, providerProductId: pkg.providerProductId },
      create: pkg,
    });
  }

  // System settings
  await prisma.systemSetting.upsert({
    where: { key: "order_processing_halted" },
    update: {},
    create: { key: "order_processing_halted", value: "false" },
  });
  await prisma.systemSetting.upsert({
    where: { key: "site_name" },
    update: {},
    create: { key: "site_name", value: "Clickyfied" },
  });
  await prisma.systemSetting.upsert({
    where: { key: "support_whatsapp" },
    update: {},
    create: { key: "support_whatsapp", value: "233551234567" },
  });
  await prisma.systemSetting.upsert({
    where: { key: "default_momo_number" },
    update: {},
    create: { key: "default_momo_number", value: "0244000000" },
  });

  // Demo users
  const userHash = await bcrypt.hash("user1234", 10);
  const resellerProfile = await prisma.pricingProfile.findUnique({ where: { name: "Reseller" } });

  const demoUser = await prisma.user.upsert({
    where: { email: "kwame@example.com" },
    update: {},
    create: {
      name: "Kwame Mensah",
      email: "kwame@example.com",
      passwordHash: userHash,
      role: "USER",
      status: "ACTIVE",
      balance: 45.5,
      phone: "0244123456",
    },
  });

  const demoReseller = await prisma.user.upsert({
    where: { email: "ama@example.com" },
    update: {},
    create: {
      name: "Ama Owusu",
      email: "ama@example.com",
      passwordHash: userHash,
      role: "RESELLER",
      status: "ACTIVE",
      balance: 120.0,
      phone: "0209876543",
      pricingProfileId: resellerProfile?.id ?? null,
    },
  });

  // Sample orders across statuses
  const orderCount = await prisma.order.count({ where: { userId: demoUser.id } });
  if (orderCount === 0) {
    const samples = [
      { phone: "0244123456", network: "MTN", gb: 2, amount: 6.5, status: "SUCCESS", daysAgo: 6 },
      { phone: "0244123456", network: "MTN", gb: 1, amount: 3.5, status: "SUCCESS", daysAgo: 4 },
      { phone: "0209876543", network: "TELECEL", gb: 5, amount: 13.0, status: "PROCESSING", daysAgo: 1 },
      { phone: "0244123456", network: "AIRTELTIGO", gb: 1, amount: 3.5, status: "FAILED", reason: "Number not reachable", daysAgo: 2 },
    ];
    for (const s of samples) {
      const created = await prisma.order.create({
        data: {
          userId: demoUser.id,
          phoneNumber: s.phone,
          network: s.network,
          gbAmount: s.gb,
          amount: s.amount,
          status: "PENDING",
          source: "WEB",
          createdAt: new Date(Date.now() - s.daysAgo * 86400000),
        },
      });
      await prisma.orderStatusHistory.create({
        data: { orderId: created.id, status: "PENDING", note: "Order placed", changedBy: "system", createdAt: created.createdAt },
      });
      await prisma.orderStatusHistory.create({
        data: { orderId: created.id, status: s.status, note: s.reason ?? null, changedBy: adminEmail, createdAt: new Date(created.createdAt.getTime() + 600000) },
      });
      await prisma.order.update({
        where: { id: created.id },
        data: { status: s.status, failureReason: s.reason ?? null },
      });
    }

    // Approved wallet history for the demo user
    await prisma.walletTransaction.create({
      data: { userId: demoUser.id, type: "TOPUP", amount: 100, status: "APPROVED", reference: "MoMo 0244000000", createdAt: new Date(Date.now() - 7 * 86400000) },
    });
    await prisma.walletTransaction.create({
      data: { userId: demoReseller.id, type: "TOPUP", amount: 200, status: "PENDING", reference: "MoMo 0209876543" },
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        actorLabel: adminEmail,
        action: "seed.initialize",
        target: "system",
        newValue: "Demo data created",
      },
    });
  }

  // ---- Batch / export / delivery-report demo data (Order Batch feature) ----
  const batchCount = await prisma.orderBatch.count();
  if (batchCount === 0) {
    const mtn2 = await prisma.dataPackage.findUnique({
      where: { network_gbAmount: { network: "MTN", gbAmount: 2 } },
    });
    const tlc1 = await prisma.dataPackage.findUnique({
      where: { network_gbAmount: { network: "TELECEL", gbAmount: 1 } },
    });

    // MTN batch: partially completed (2 success, 1 processing+exported, 1 failed, 1 pending)
    const mtnBatch = await prisma.orderBatch.create({
      data: {
        batchCode: "CF-BATCH-000001",
        userId: demoUser.id,
        network: "MTN",
        totalRecipients: 5,
        totalGb: 10,
        totalAmount: 32.5,
        status: "PARTIALLY_COMPLETED",
        createdAt: new Date(Date.now() - 3 * 86400000),
      },
    });

    const mtnRecipients = [
      { phone: "0244000001", status: "SUCCESS", exported: true, daysAgo: 3 },
      { phone: "0244000002", status: "SUCCESS", exported: true, daysAgo: 3 },
      { phone: "0244000003", status: "PROCESSING", exported: true, daysAgo: 3 },
      { phone: "0244000004", status: "FAILED", exported: true, reason: "Number not reachable", daysAgo: 3 },
      { phone: "0244000005", status: "PENDING", exported: false, daysAgo: 3 },
    ];
    const mtnOrderIds: number[] = [];
    for (const r of mtnRecipients) {
      const created = await prisma.order.create({
        data: {
          userId: demoUser.id,
          batchId: mtnBatch.id,
          packageId: mtn2?.id ?? null,
          phoneNumber: r.phone,
          network: "MTN",
          gbAmount: 2,
          amount: 6.5,
          status: r.status,
          failureReason: r.reason ?? null,
          source: "WEB",
          createdAt: new Date(Date.now() - r.daysAgo * 86400000),
        },
      });
      mtnOrderIds.push(created.id);
      await prisma.orderStatusHistory.create({
        data: { orderId: created.id, status: "PENDING", note: "Order placed", changedBy: "system", createdAt: created.createdAt },
      });
      if (r.status !== "PENDING") {
        await prisma.orderStatusHistory.create({
          data: {
            orderId: created.id,
            status: r.status,
            note: r.reason ?? "Processed via export batch",
            changedBy: adminEmail,
            createdAt: new Date(created.createdAt.getTime() + 3600000),
          },
        });
      }
    }

    // TELECEL batch: still pending, waiting for the first export
    const tlcBatch = await prisma.orderBatch.create({
      data: {
        batchCode: "CF-BATCH-000002",
        userId: demoReseller.id,
        network: "TELECEL",
        totalRecipients: 3,
        totalGb: 3,
        totalAmount: 16.5,
        status: "PENDING",
        createdAt: new Date(Date.now() - 86400000),
      },
    });
    for (const phone of ["0209000001", "0209000002", "0209000003"]) {
      const created = await prisma.order.create({
        data: {
          userId: demoReseller.id,
          batchId: tlcBatch.id,
          packageId: tlc1?.id ?? null,
          phoneNumber: phone,
          network: "TELECEL",
          gbAmount: 1,
          amount: 5.5,
          status: "PENDING",
          source: "WEB",
          createdAt: new Date(Date.now() - 86400000),
        },
      });
      await prisma.orderStatusHistory.create({
        data: { orderId: created.id, status: "PENDING", note: "Order placed", changedBy: "system", createdAt: created.createdAt },
      });
    }

    // Export batch covering the processed MTN recipients
    const exportBatch = await prisma.exportBatch.create({
      data: {
        exportCode: "CF-EXPORT-00001",
        network: "MTN",
        adminId: admin.id,
        adminLabel: adminEmail,
        totalRecipients: 4,
        totalGb: 8,
        totalAmount: 26.0,
        status: "PARTIALLY_COMPLETED",
        fileName: "CF-EXPORT-00001_MTN.xlsx",
        isReexport: false,
        note: "Initial dispatch for MTN batch CF-BATCH-000001",
        createdAt: new Date(Date.now() - 3 * 86400000 + 7200000),
      },
    });
    const exportedStatuses = new Set(["SUCCESS", "PROCESSING", "FAILED"]);
    const exportedIds = mtnOrderIds.filter((_, i) => exportedStatuses.has(mtnRecipients[i].status));
    for (const id of exportedIds) {
      await prisma.order.update({
        where: { id },
        data: {
          exportBatchId: exportBatch.id,
          exportCount: 1,
          lastExportedAt: exportBatch.createdAt,
          lastExportedBy: adminEmail,
        },
      });
    }
    await prisma.exportBatch.update({
      where: { id: exportBatch.id },
      data: { orders: { connect: exportedIds.map((id) => ({ id })) } },
    });
    await prisma.orderBatch.update({
      where: { id: mtnBatch.id },
      data: { exportBatches: { connect: { id: exportBatch.id } } },
    });

    // "Not Received" report for the failed MTN recipient
    const failedIndex = mtnRecipients.findIndex((r) => r.status === "FAILED");
    const existingMaxSeq = await prisma.deliveryReport.aggregate({ _max: { seq: true } });
    await prisma.deliveryReport.create({
      data: {
        orderId: mtnOrderIds[failedIndex],
        seq: (existingMaxSeq._max.seq ?? 0) + 1,
        userId: demoUser.id,
        reason: "Data not received",
        message: "The number has had no data since yesterday.",
        status: "OPEN",
        createdAt: new Date(Date.now() - 2 * 86400000),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        actorLabel: adminEmail,
        action: "seed.demo_batches",
        target: "batches",
        newValue: "Demo batches, export history and delivery report created",
      },
    });
  }

  console.log("Seed complete:");
  console.log(`  Admin: ${adminEmail} / ${adminPassword}`);
  console.log(`  User:  kwame@example.com / user1234`);
  console.log(`  Reseller: ama@example.com / user1234`);
  console.log(`  Default profile: ${defaultProfile.name}`);
  console.log(`  Packages: ${packages.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { fromPesewas } from "@/lib/storefront";

export const dynamic = "force-dynamic";

/**
 * Admin: List and track all storefront wallets of storefront users,
 * including available balances, pending commissions, withdrawals, and lifetime earnings.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get("userId");

    // If a specific userId is requested, return full detailed wallet history
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          storefronts: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              isActive: true,
              isCustomDomain: true,
              phone: true,
              whatsapp: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
          storefrontWallet: {
            include: {
              transactions: {
                orderBy: { createdAt: "desc" },
                take: 100,
              },
            },
          },
          storefrontWithdrawals: {
            orderBy: { requestedAt: "desc" },
            take: 50,
          },
        },
      });

      if (!user) {
        return apiError(404, "Storefront user not found");
      }

      // Also get recent storefront orders for context
      const recentOrders = await prisma.storefrontOrder.findMany({
        where: { storefront: { userId } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          seq: true,
          customerPhone: true,
          customerEmail: true,
          sellingPrice: true,
          productCost: true,
          commission: true,
          status: true,
          commissionState: true,
          paymentReference: true,
          createdAt: true,
          product: {
            select: {
              dataPackage: {
                select: {
                  name: true,
                  network: true,
                  gbAmount: true,
                },
              },
            },
          },
        },
      });

      const balance = user.storefrontWallet?.balance ?? 0;
      const pendingBalance = user.storefrontWallet?.pendingBalance ?? 0;
      const approvedWithdrawals = user.storefrontWithdrawals
        .filter((w) => w.status === "APPROVED")
        .reduce((sum, w) => sum + w.amount, 0);
      const pendingWithdrawals = user.storefrontWithdrawals
        .filter((w) => w.status === "PENDING")
        .reduce((sum, w) => sum + w.amount, 0);

      const primaryStorefront =
        user.storefronts.find((s) => !s.isCustomDomain) || user.storefronts[0] || null;

      return NextResponse.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status,
          createdAt: user.createdAt,
        },
        storefront: primaryStorefront,
        allStorefronts: user.storefronts,
        wallet: {
          id: user.storefrontWallet?.id ?? null,
          balance,
          pendingBalance,
          balanceGHS: fromPesewas(balance),
          pendingBalanceGHS: fromPesewas(pendingBalance),
          totalWithdrawn: approvedWithdrawals,
          totalWithdrawnGHS: fromPesewas(approvedWithdrawals),
          pendingWithdrawals,
          pendingWithdrawalsGHS: fromPesewas(pendingWithdrawals),
          lifetimeEarned: balance + pendingBalance + approvedWithdrawals,
          lifetimeEarnedGHS: fromPesewas(balance + pendingBalance + approvedWithdrawals),
        },
        transactions: (user.storefrontWallet?.transactions ?? []).map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          amountGHS: fromPesewas(t.amount),
          balanceBefore: t.balanceBefore,
          balanceAfter: t.balanceAfter,
          balanceBeforeGHS: fromPesewas(t.balanceBefore),
          balanceAfterGHS: fromPesewas(t.balanceAfter),
          pendingBefore: t.pendingBefore,
          pendingAfter: t.pendingAfter,
          pendingBeforeGHS: t.pendingBefore !== null ? fromPesewas(t.pendingBefore) : null,
          pendingAfterGHS: t.pendingAfter !== null ? fromPesewas(t.pendingAfter) : null,
          reference: t.reference,
          description: t.description,
          createdAt: t.createdAt.toISOString(),
        })),
        withdrawals: user.storefrontWithdrawals.map((w) => ({
          id: w.id,
          seq: w.seq,
          reference: w.reference ?? `TSK-WD-${String(w.seq).padStart(5, "0")}`,
          amount: w.amount,
          amountGHS: fromPesewas(w.amount),
          fee: w.fee,
          feeGHS: fromPesewas(w.fee),
          netAmount: w.netAmount ?? w.amount - w.fee,
          netAmountGHS: fromPesewas(w.netAmount ?? w.amount - w.fee),
          network: w.network,
          momoNumber: w.momoNumber,
          accountName: w.accountName,
          status: w.status,
          note: w.note,
          adminNote: w.adminNote,
          requestedAt: w.requestedAt.toISOString(),
          processedAt: w.processedAt ? w.processedAt.toISOString() : null,
        })),
        recentOrders: recentOrders.map((o) => ({
          id: o.id,
          seq: o.seq,
          orderCode: o.paymentReference?.startsWith("GH-") ? o.paymentReference : `TSK-ST-${String(o.seq).padStart(5, "0")}`,
          customerPhone: o.customerPhone,
          customerEmail: o.customerEmail,
          sellingPrice: o.sellingPrice,
          sellingPriceGHS: fromPesewas(o.sellingPrice),
          productCost: o.productCost,
          productCostGHS: fromPesewas(o.productCost),
          commission: o.commission,
          commissionGHS: fromPesewas(o.commission),
          status: o.status,
          commissionState: o.commissionState,
          paymentReference: o.paymentReference,
          packageName: o.product?.dataPackage?.name ?? "Data Package",
          network: o.product?.dataPackage?.network ?? "MTN",
          gbAmount: o.product?.dataPackage?.gbAmount ?? 0,
          createdAt: o.createdAt.toISOString(),
        })),
      });
    }

    // List query across all storefront users
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const filter = searchParams.get("filter") || "ALL"; // ALL, HAS_BALANCE, HAS_PENDING, ZERO, WITHDRAWAL_PENDING
    const sortBy = searchParams.get("sortBy") || "balance"; // balance, pending, lifetime, withdrawn, recent
    const sortOrder = searchParams.get("order") === "asc" ? "asc" : "desc";

    // Find users who have either a Storefront or a StorefrontWallet
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { storefronts: { some: {} } },
          { storefrontWallet: { isNot: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        storefronts: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            isActive: true,
            isCustomDomain: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        storefrontWallet: {
          select: {
            id: true,
            balance: true,
            pendingBalance: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { transactions: true },
            },
          },
        },
        storefrontWithdrawals: {
          select: {
            id: true,
            amount: true,
            status: true,
            requestedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Map and enrich data
    let wallets = users.map((u) => {
      const primaryStorefront =
        u.storefronts.find((s) => !s.isCustomDomain) || u.storefronts[0] || null;
      const balance = u.storefrontWallet?.balance ?? 0;
      const pendingBalance = u.storefrontWallet?.pendingBalance ?? 0;

      const approvedWithdrawals = u.storefrontWithdrawals
        .filter((w) => w.status === "APPROVED")
        .reduce((sum, w) => sum + w.amount, 0);

      const pendingWithdrawalsList = u.storefrontWithdrawals.filter((w) => w.status === "PENDING");
      const pendingWithdrawalsAmount = pendingWithdrawalsList.reduce((sum, w) => sum + w.amount, 0);
      const pendingWithdrawalsCount = pendingWithdrawalsList.length;

      const lifetimeEarned = balance + pendingBalance + approvedWithdrawals;

      return {
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        userPhone: u.phone,
        userStatus: u.status,
        userCreatedAt: u.createdAt.toISOString(),
        storefront: primaryStorefront
          ? {
              id: primaryStorefront.id,
              name: primaryStorefront.name,
              slug: primaryStorefront.slug,
              status: primaryStorefront.status,
              isActive: primaryStorefront.isActive,
            }
          : null,
        walletId: u.storefrontWallet?.id ?? null,
        balance,
        pendingBalance,
        balanceGHS: fromPesewas(balance),
        pendingBalanceGHS: fromPesewas(pendingBalance),
        totalWithdrawn: approvedWithdrawals,
        totalWithdrawnGHS: fromPesewas(approvedWithdrawals),
        pendingWithdrawalsCount,
        pendingWithdrawalsAmount,
        pendingWithdrawalsAmountGHS: fromPesewas(pendingWithdrawalsAmount),
        lifetimeEarned,
        lifetimeEarnedGHS: fromPesewas(lifetimeEarned),
        transactionsCount: u.storefrontWallet?._count.transactions ?? 0,
        walletUpdatedAt: u.storefrontWallet?.updatedAt?.toISOString() ?? null,
      };
    });

    // Calculate platform overview stats from the full set before filtering
    const overview = {
      totalWallets: wallets.length,
      totalBalanceGHS: fromPesewas(wallets.reduce((s, w) => s + w.balance, 0)),
      totalPendingBalanceGHS: fromPesewas(wallets.reduce((s, w) => s + w.pendingBalance, 0)),
      totalWithdrawnGHS: fromPesewas(wallets.reduce((s, w) => s + w.totalWithdrawn, 0)),
      totalLifetimeEarnedGHS: fromPesewas(wallets.reduce((s, w) => s + w.lifetimeEarned, 0)),
      pendingWithdrawalsCount: wallets.reduce((s, w) => s + w.pendingWithdrawalsCount, 0),
      pendingWithdrawalsAmountGHS: fromPesewas(wallets.reduce((s, w) => s + w.pendingWithdrawalsAmount, 0)),
    };

    // Filter by search query
    if (search) {
      wallets = wallets.filter((w) => {
        return (
          w.userName.toLowerCase().includes(search) ||
          w.userEmail.toLowerCase().includes(search) ||
          (w.userPhone && w.userPhone.toLowerCase().includes(search)) ||
          (w.storefront && w.storefront.name.toLowerCase().includes(search)) ||
          (w.storefront && w.storefront.slug.toLowerCase().includes(search))
        );
      });
    }

    // Filter by quick filter
    if (filter === "HAS_BALANCE") {
      wallets = wallets.filter((w) => w.balance > 0);
    } else if (filter === "HAS_PENDING") {
      wallets = wallets.filter((w) => w.pendingBalance > 0);
    } else if (filter === "ZERO") {
      wallets = wallets.filter((w) => w.balance === 0 && w.pendingBalance === 0);
    } else if (filter === "WITHDRAWAL_PENDING") {
      wallets = wallets.filter((w) => w.pendingWithdrawalsCount > 0);
    }

    // Sort
    wallets.sort((a, b) => {
      let diff = 0;
      if (sortBy === "balance") {
        diff = a.balance - b.balance;
      } else if (sortBy === "pending") {
        diff = a.pendingBalance - b.pendingBalance;
      } else if (sortBy === "lifetime") {
        diff = a.lifetimeEarned - b.lifetimeEarned;
      } else if (sortBy === "withdrawn") {
        diff = a.totalWithdrawn - b.totalWithdrawn;
      } else if (sortBy === "recent") {
        diff = new Date(a.userCreatedAt).getTime() - new Date(b.userCreatedAt).getTime();
      }
      return sortOrder === "asc" ? diff : -diff;
    });

    return NextResponse.json({
      wallets,
      overview,
      total: wallets.length,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

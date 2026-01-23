/**
 * Cron endpoint for sending scheduled reminder emails
 *
 * This endpoint should be called by a cron job (e.g., Vercel Cron, GitHub Actions)
 * It checks for events with pending reminders and sends them to all confirmed RSVPs
 *
 * Security: Requires CRON_SECRET header to prevent unauthorized access
 */

import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { generateConfirmationEmail, EventData } from "@/lib/email-template";
import eventConfig from "@/event-config.json";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for sending many emails

export async function GET(request: NextRequest) {
  // Validate cron secret for security
  // Vercel Cron uses CRON_SECRET header, manual calls use Authorization header
  const authHeader = request.headers.get("authorization");
  const vercelCronHeader = request.headers.get("x-vercel-cron-secret"); // Vercel's auto cron
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is set, validate it (support both Vercel cron and manual calls)
  if (cronSecret) {
    const isVercelCron = vercelCronHeader === cronSecret;
    const isManualCall = authHeader === `Bearer ${cronSecret}`;

    if (!isVercelCron && !isManualCall) {
      console.log(
        "❌ [CRON] Unauthorized request - invalid or missing CRON_SECRET",
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: "Database not configured",
      },
      { status: 500 },
    );
  }

  try {
    const {
      getEventsWithPendingReminders,
      getConfirmedRSVPsForReminder,
      markReminderSent,
      generateCancelToken,
      recordEmailSent,
    } = await import("@/lib/queries");

    // Get all events with pending reminders
    const eventsToRemind = await getEventsWithPendingReminders();

    console.log(
      `📧 [CRON] Found ${eventsToRemind.length} events with pending reminders`,
    );

    if (eventsToRemind.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending reminders",
        processed: 0,
      });
    }

    const results: Array<{
      eventId: string;
      eventTitle: string;
      sent: number;
      failed: number;
      errors: string[];
    }> = [];

    // Process each event
    for (const event of eventsToRemind) {
      console.log(
        `📧 [CRON] Processing reminders for event: ${event.title} (${event.slug})`,
      );

      const eventResult = {
        eventId: event.id,
        eventTitle: event.title,
        sent: 0,
        failed: 0,
        errors: [] as string[],
      };

      try {
        // Get all confirmed RSVPs for this event (by slug, as that's how eventId is stored in RSVPs)
        const rsvps = await getConfirmedRSVPsForReminder(event.slug);

        console.log(
          `📧 [CRON] Found ${rsvps.length} confirmed RSVPs for ${event.slug}`,
        );

        if (rsvps.length === 0) {
          // Mark as sent even if no RSVPs to avoid re-processing
          await markReminderSent(event.id);
          results.push(eventResult);
          continue;
        }

        // Build EventData for the email template
        const theme = (event.theme as any) || {};
        const eventData: EventData = {
          title: event.title,
          subtitle: event.subtitle || "",
          date: event.date || "",
          time: event.time || "",
          location: event.location || "",
          details: event.details || "",
          price: event.priceEnabled
            ? `$${event.priceAmount} ${event.priceCurrency || "MXN"}`
            : null,
          backgroundImageUrl: event.backgroundImageUrl || "/background.png",
          theme: {
            primaryColor: theme.primaryColor || "#FF1493",
            secondaryColor: theme.secondaryColor || "#00FFFF",
            accentColor: theme.accentColor || "#FFD700",
            backgroundColor: theme.backgroundColor || "#1a0033",
          },
          contact: {
            hostEmail: event.hostEmail || eventConfig.contact?.hostEmail,
          },
        };

        // Send reminder to each RSVP
        for (const rsvp of rsvps) {
          try {
            // Generate cancel token and URL
            const cancelToken = generateCancelToken(rsvp.id, rsvp.email);
            const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/cancel/${rsvp.id}?token=${cancelToken}`;

            // Generate email HTML (isReminder = true)
            const htmlContent = generateConfirmationEmail({
              name: rsvp.name,
              plusOne: rsvp.plusOne || false,
              cancelUrl,
              isReminder: true,
              isCancelled: false,
              eventData,
            });

            // Send email
            const { error: emailError } = await resend.emails.send({
              from: `Party Time! <${FROM_EMAIL}>`,
              to: rsvp.email,
              subject: `Recordatorio - ${event.title}`,
              html: htmlContent,
            });

            if (emailError) {
              console.error(
                `❌ [CRON] Failed to send reminder to ${rsvp.email}:`,
                emailError,
              );
              eventResult.failed++;
              eventResult.errors.push(
                `${rsvp.email}: ${emailError.message || "Unknown error"}`,
              );
            } else {
              // Record email sent
              await recordEmailSent(rsvp.id, "reminder");
              eventResult.sent++;
              console.log(`✅ [CRON] Reminder sent to ${rsvp.email}`);
            }

            // 5 second delay between each email to ensure reliable delivery
            await new Promise((resolve) => setTimeout(resolve, 5000));
          } catch (rsvpError: any) {
            console.error(
              `❌ [CRON] Error processing RSVP ${rsvp.id}:`,
              rsvpError,
            );
            eventResult.failed++;
            eventResult.errors.push(`${rsvp.email}: ${rsvpError.message}`);
          }
        }

        // Mark event reminder as sent
        await markReminderSent(event.id);
        console.log(`✅ [CRON] Event ${event.slug} marked as reminder sent`);
      } catch (eventError: any) {
        console.error(
          `❌ [CRON] Error processing event ${event.id}:`,
          eventError,
        );
        eventResult.errors.push(`Event error: ${eventError.message}`);
      }

      results.push(eventResult);
    }

    // Calculate totals
    const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

    console.log(
      `📧 [CRON] Completed - Total sent: ${totalSent}, Total failed: ${totalFailed}`,
    );

    return NextResponse.json({
      success: true,
      message: `Processed ${eventsToRemind.length} event(s)`,
      summary: {
        eventsProcessed: eventsToRemind.length,
        totalSent,
        totalFailed,
      },
      results,
    });
  } catch (error: any) {
    console.error("❌ [CRON] Error in send-reminders:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error processing reminders",
      },
      { status: 500 },
    );
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request);
}

'use strict';

function createAgendaSyncService({
  agendaService,
  googleCalendarService,
  googleSync,
  now = () => new Date(),
  logger = console,
} = {}) {
  const syncOptions = () => ({ timeZone: googleCalendarService.timeZone });

  async function syncAgenda(tokens) {
    const calendar = googleCalendarService.createCalendar(tokens);
    agendaService.purgeExpiredEventsSafely();
    const localSyncMin = agendaService.getLocalSyncMin();
    const googleSyncTimeMin = agendaService.getGoogleSyncTimeMin();
    const target = await googleCalendarService.getCalendarTarget(calendar);
    const googleResult = await googleSync.listGoogleCalendarEvents(calendar, googleCalendarService.calendarId, {
      timeMin: googleSyncTimeMin,
    });
    const googleEvents = googleResult.items;
    const localEvents = agendaService.listSyncEvents(localSyncMin);
    const cancellations = googleSync.planGoogleCancellations(localEvents, googleEvents);

    agendaService.deleteLinkedEvents(cancellations.deleteLocal);

    const preview = googleSync.buildSyncPreview(
      cancellations.remainingLocalRows,
      cancellations.activeGoogleRows,
      syncOptions()
    );
    preview.actions.deleteLocal = cancellations.deleteLocal;

    if (preview.actions.ambiguous.length || preview.actions.errors.length) {
      return {
        status: 'conflict',
        report: { calendar: target, preview },
        message: 'Synchronisation annulée : des ambiguïtés ou erreurs doivent être corrigées.',
      };
    }

    for (const item of preview.actions.link) {
      agendaService.setGoogleEventId(item.google.normalized.id, item.local.normalized.rawId);
    }

    for (const item of preview.actions.updateLocal) {
      agendaService.updateFromGoogle(item.google.normalized, {
        id: item.local.normalized.rawId,
        type: item.local.row.type,
      });
    }

    for (const item of preview.actions.importLocal) {
      agendaService.importFromGoogle(item.google.normalized, now());
    }

    const recoverOrCreateGoogle = async (localItem) => {
      const body = googleSync.googleRequestBodyFromLocal(localItem.row, syncOptions());
      if (!body) return null;
      if (cancellations.cancelledGoogleEventIds.has(localItem.normalized.googleEventId)) return null;

      const refreshedResult = await googleSync.listGoogleCalendarEvents(calendar, googleCalendarService.calendarId, {
        timeMin: googleSyncTimeMin,
      });
      const refreshedCancellations = googleSync.planGoogleCancellations([localItem.row], refreshedResult.items);
      for (const deletedId of refreshedCancellations.cancelledGoogleEventIds) {
        cancellations.cancelledGoogleEventIds.add(deletedId);
      }
      if (refreshedCancellations.deleteLocal.length) {
        agendaService.deleteLinkedEvents(refreshedCancellations.deleteLocal);
        return null;
      }
      const refreshedPreview = googleSync.buildSyncPreview(
        refreshedCancellations.remainingLocalRows,
        refreshedCancellations.activeGoogleRows,
        syncOptions()
      );
      const relink = refreshedPreview.actions.link[0] || refreshedPreview.actions.updateGoogle[0];
      if (relink?.google?.normalized?.id) {
        agendaService.setGoogleEventId(relink.google.normalized.id, localItem.normalized.rawId);
        return relink.google.normalized.id;
      }

      const created = await calendar.events.insert({
        calendarId: googleCalendarService.calendarId,
        requestBody: body,
      });
      if (created.data.id) agendaService.setGoogleEventId(created.data.id, localItem.normalized.rawId);
      return created.data.id || null;
    };

    const applyErrors = [];
    for (const item of preview.actions.updateGoogle) {
      const body = googleSync.googleRequestBodyFromLocal(item.local.row, syncOptions());
      if (!body) continue;
      try {
        await calendar.events.update({
          calendarId: googleCalendarService.calendarId,
          eventId: item.google.normalized.id,
          requestBody: body,
        });
      } catch (error) {
        if (googleSync.isNotFoundGoogleError(error)) {
          try {
            await recoverOrCreateGoogle(item.local);
          } catch (recoverError) {
            logger.error('Erreur recuperation lien Google Agenda :', recoverError.response ? recoverError.response.data : recoverError);
            applyErrors.push(`Recuperation impossible pour ${item.local.normalized.title}`);
          }
        } else {
          logger.error('Erreur mise a jour Google Agenda :', error.response ? error.response.data : error);
          applyErrors.push(`Mise a jour Google impossible pour ${item.local.normalized.title}`);
        }
      }
    }

    for (const item of preview.actions.createGoogle) {
      try {
        await recoverOrCreateGoogle(item.local);
      } catch (error) {
        logger.error('Erreur creation Google Agenda :', error.response ? error.response.data : error);
        applyErrors.push(`Creation Google impossible pour ${item.local.normalized.title}`);
      }
    }

    preview.actions.errors.push(...applyErrors.map((message) => ({ message })));
    return {
      status: 'applied',
      report: { calendar: target, preview },
      message: applyErrors.length
        ? 'Synchronisation appliquée partiellement : certains événements sont en erreur.'
        : `Synchronisation appliquée. ${cancellations.deleteLocal.length} suppression(s) Google appliquée(s) localement.`,
    };
  }

  return { syncAgenda };
}

module.exports = { createAgendaSyncService };

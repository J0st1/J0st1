//Bestill api nøkkel og få metering point id fra Å Energi.
//legg de inn "mellom" '' under. (' må ikke fjernes).

const API_KEY = 'Legg inn din API key her';
const METERING_POINT_ID = 'Legg inn din metering point ID her';
const URL = 'https://api.aenergi.no/Glitrenett/gridtariff/api/1/tariffquery/meteringpointsgridtariffs/';


async function main() {
  try {
    // 1. Hent tariff-data
    const response = await fetch(URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        range: 'today',
        meteringPointIds: [METERING_POINT_ID]
      })
    });

    if (!response.ok) throw new Error(`API-feil: ${response.status}`);

    const json = await response.json();
    const tariffData = json.gridTariffCollections?.[0];
    if (!tariffData) {
      log('Ingen gridTariffCollections funnet.');
      return;
    }

    // 2. Finn nåværende levelId
    const mpLevels = tariffData.meteringPointsAndPriceLevels;
    let currentLevelId = null;
    if (Array.isArray(mpLevels) && mpLevels.length > 0) {
      const mp = mpLevels[0];
      if (mp.currentFixedPriceLevel && mp.currentFixedPriceLevel.levelId) {
        currentLevelId = mp.currentFixedPriceLevel.levelId;
      }
    }

    if (!currentLevelId) {
      log('Fant ikke levelId for ditt målepunkt.');
      return;
    }

    await tag('Glitre_CurrentFixedPriceLevelId', currentLevelId);
    log(`Din nåværende price levelId: ${currentLevelId}`);

    // 3. FixedPrices for i dag
    const fixedPrices = tariffData.gridTariff?.tariffPrice?.priceInfo?.fixedPrices;
    if (!Array.isArray(fixedPrices) || !fixedPrices.length) {
      log('Ingen fixedPrices funnet.');
      return;
    }

    const todayFixedPrices = fixedPrices[0];

    // 4. PriceLevels (prøv alle varianter)
    const pricelevels = todayFixedPrices.priceLevels || todayFixedPrices.pricelevels || todayFixedPrices.levels;
    if (!Array.isArray(pricelevels)) {
      log('Ingen priceLevels/pricelevels/levels funnet.');
      return;
    }

    const currentPriceLevel = pricelevels.find(pl => pl.id === currentLevelId);
    if (!currentPriceLevel) {
      log('Fant ikke ditt priceLevel i fixedPrices.');
      return;
    }

    log(`Du er nå på pricelevel: ${currentPriceLevel.levelInfo} (${currentPriceLevel.valueMin}-${currentPriceLevel.valueMax} kWh/h)`);
    await tag('Glitre_CurrentPriceLevelInfo', currentPriceLevel.levelInfo);

    // 5. Sett tag med pris på nåværende kapasitetstrinn
    await tag('Glitre_CurrentPriceLevelMonthlyTotal', currentPriceLevel.monthlyTotal);
    log(`CurrentPriceLevelMonthlyTotal = ${currentPriceLevel.monthlyTotal}`);

    // 6. Cheap/Normal totals (beholder for info)
    const energyPrices = tariffData.gridTariff?.tariffPrice?.priceInfo?.energyPrices;
    let cheap = null, normal = null;

    if (Array.isArray(energyPrices)) {
      for (const p of energyPrices) {
        if (p.level && p.level.toLowerCase() === 'cheap') cheap = p.total;
        if (p.level && p.level.toLowerCase() === 'normal') normal = p.total;
      }
    }

    if (cheap !== null) {
      log(`Cheap energy price: ${cheap}`);
      await tag('Glitre_EnergyPrice_Cheap', cheap);
    }

    if (normal !== null) {
      log(`Normal energy price: ${normal}`);
      await tag('Glitre_EnergyPrice_Normal', normal);
    }

    // 7. Sett tagger for alle pricelevels
    for (const pl of pricelevels) {
      const tagName = `Glitre_FixedPrice_${pl.valueMin}_${pl.valueMax}`;
      await tag(tagName, pl.monthlyTotal);
      log(`Tagg satt: ${tagName} = ${pl.monthlyTotal}`);
    }

    // 8. Timespriser uten cheap/normal i tag-navnet
    if (Array.isArray(energyPrices)) {
      for (const ep of energyPrices) {
        if (Array.isArray(ep.prices)) {
          for (const price of ep.prices) {
            const date = new Date(price.startTime);
            const hour = date.getHours().toString().padStart(2, '0');
            // bare klokkeslett i tag-navnet
            const tagName = `Glitre_EnergyPrice_${hour}`;
            await tag(tagName, price.total);
            log(`Timespris tag satt: ${tagName} = ${price.total}`);
          }
        }
      }
    } else {
      log('Fant ingen timespriser i energyPrices.');
    }

  } catch (err) {
    log('Feil i scriptet: ' + err.message);
  }
}

await main();

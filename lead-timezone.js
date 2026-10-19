// Shared prospect timezone lookup for Outreach and the standalone call screen.
const CALLCENTER_AREA_CODE_ZONES = {};
function callcenterAddAreaCodes(zone, codes) {
  String(codes).trim().split(/\s+/).filter(Boolean).forEach(code => CALLCENTER_AREA_CODE_ZONES[code] = zone);
}
callcenterAddAreaCodes('America/Los_Angeles', `206 209 213 253 279 310 323 341 360 369 408 415 424 425 442 458 503 509 510 530 541 559 562 619 626 628 650 657 661 669 702 707 714 725 747 760 775 805 818 820 831 840 858 909 916 925 949 951 971 986`);
callcenterAddAreaCodes('America/Phoenix', `480 520 602 623 928`);
callcenterAddAreaCodes('America/Denver', `303 307 385 406 435 505 575 719 720 801 970 983`);
callcenterAddAreaCodes('America/Boise', `208 986`);
callcenterAddAreaCodes('America/Chicago', `205 210 214 217 224 225 228 251 254 262 281 308 309 312 314 316 318 319 320 325 331 334 346 361 409 417 430 432 447 469 479 501 504 507 512 515 534 539 563 573 580 601 605 608 612 615 618 620 630 636 641 651 660 662 682 701 708 712 713 715 726 737 763 769 779 785 806 815 816 817 830 832 847 850 870 872 903 913 918 920 936 940 945 956 972 975 979 985 270 364`);
callcenterAddAreaCodes('America/New_York', `201 202 203 207 212 215 216 220 223 227 229 231 234 239 240 248 252 267 269 272 276 301 302 304 305 313 315 321 330 332 336 339 347 351 352 380 386 401 404 407 410 412 413 419 423 434 440 445 448 470 475 478 484 502 508 513 516 517 518 540 551 561 567 570 571 574 582 585 586 603 606 607 609 610 614 616 617 631 640 646 656 659 667 678 680 681 689 703 704 706 716 717 724 727 732 734 740 743 754 757 762 765 770 772 774 781 786 802 803 804 810 813 814 826 828 835 843 845 848 850 854 856 857 859 860 862 863 864 878 904 908 910 912 914 917 919 929 930 934 937 941 943 947 948 954 959 980 984 989`);
callcenterAddAreaCodes('America/Anchorage', `907`);
callcenterAddAreaCodes('Pacific/Honolulu', `808`);

function callcenterPhoneAreaCode(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4);
  if (digits.length >= 10) return digits.slice(0, 3);
  return '';
}

function callcenterNormalizedZone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('/')) {
    // CRM imports can contain obsolete or malformed zones. One bad row must
    // never prevent every assigned prospect from rendering (including Safari).
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: raw }).format();
      return raw;
    } catch { return ''; }
  }
  const key = raw.toLowerCase().replace(/\s+/g, '');
  if (/pacific|pst|pdt/.test(key)) return 'America/Los_Angeles';
  if (/mountain|mst|mdt/.test(key)) return 'America/Denver';
  if (/central|cst|cdt/.test(key)) return 'America/Chicago';
  if (/eastern|est|edt/.test(key)) return 'America/New_York';
  if (/arizona/.test(key)) return 'America/Phoenix';
  if (/alaska|akst|akdt/.test(key)) return 'America/Anchorage';
  if (/hawai|hst/.test(key)) return 'Pacific/Honolulu';
  return '';
}

function callcenterLeadZone(phone, storedTimezone) {
  const area = callcenterPhoneAreaCode(phone);

  // An explicit CRM timezone is more accurate than an area-code guess.
  const stored = callcenterNormalizedZone(storedTimezone);
  if (stored) return { zone: stored, area, source: 'crm' };

  const areaZone = CALLCENTER_AREA_CODE_ZONES[area];
  if (areaZone) return { zone: areaZone, area, source: 'area' };

  return { zone: 'America/Los_Angeles', area, source: 'fallback' };
}

window.callcenterLeadZone = callcenterLeadZone;

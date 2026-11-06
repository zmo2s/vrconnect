# Refonte visionOS — journal des itérations

1 — Fond gris uni, sans profondeur → environnement ambiant flou (halos bleu, lavande, pêche très diffus) derrière tous les panneaux.  
2 — Panneaux blancs opaques → verre dépoli translucide (flou 40 px, saturation 180 %, liseré lumineux en haut, ombre douce en trois couches).  
3 — Icônes au trait épais (2 px) → trait fin de 1,6 px sur toutes les icônes.  
4 — Police générique → pile système Apple (SF Pro Text/Display), repli sur Segoe UI Variable sous Windows.  
5 — Hiérarchie typographique faible → échelle Apple : Large Title 34/700, Title 22/700, Headline 15/600, Body 13–15, Footnote 12,5.  
6 — Cinq couleurs d'icônes concurrentes (vert, bleu, orange, jaune, violet) → icônes monochromes dans des pastilles neutres, une seule couleur d'accent.  
7 — Libellés de statut colorés en plus du point coloré → texte neutre ; la couleur ne reste que sur la pastille, là où elle porte du sens.  
8 — Étoile de favori jaune (2e couleur d'accent) → étoile à la couleur d'accent unique.  
9 — Barre latérale collée au bord de l'écran → panneau flottant en verre, coins de 32 px, comme la barre d'onglets de visionOS.  
10 — Élément de navigation actif en aplat bleu pâle → capsule de verre plus dense et icône en accent.  
11 — Barre du haut pleine largeur → barre d'outils flottante en capsule.  
12 — Contenu serré (28 px) → marges de 40 px et 48 px entre les sections.  
13 — Cartes de statistiques aux coins de 12 px et chiffres moyens → coins de 24 px, chiffres en 28 px display.  
14 — Images des mondes collées au bord des cartes → image en retrait (coins 20 px) dans une carte de 28 px.  
15 — Liste d'amis en tableau à bordures pleines → liste groupée sur verre, séparateurs en retrait qui s'effacent au survol.  
16 — En-têtes de colonnes en MAJUSCULES espacées → casse normale, 13 px medium.  
17 — Boutons rectangulaires → capsules partout.  
18 — Cibles de 34–40 px, difficiles à viser au pointeur en VR → 44 px minimum pour tout ce qui est cliquable.  
19 — Onglets carrés → contrôle segmenté en capsule.  
20 — Recherche et filtres en rectangles dispersés → capsules regroupées dans une barre de verre.  
21 — Survol presque invisible → effet « regard » : léger soulèvement et verre plus lumineux ; appui : réduction à 97 %.  
22 — Fond de dialogue noir à 80 % (écrasant) → voile à 20 % avec flou, feuilles en verre aux coins de 32 px.  
23 — Menus, listes déroulantes et palette aux coins de 6 px, éléments de 32 px → verre, coins de 16 px, éléments de 44 px.  
24 — Interrupteurs petits (24 px) → 28 px, plus faciles à viser.  
25 — Apparition brutale de la page → entrée douce et décalée des sections (désactivée si « réduire les animations »).  
26 — Barre de filtres collante transparente : la liste défilait à travers → capsule de verre opaque au flou.  
27 — Mobile : la barre d'onglets fixe remontait en haut de l'écran (le flou du parent créait un bloc conteneur) → flou retiré du parent, barre d'onglets flottante en bas.  
28 — Mobile : barre de filtres en capsule déformée sur plusieurs lignes → coins de 24 px.  
29 — Pastilles « Public » et « 2 » illisibles sur les images claires → verre sombre, texte blanc semi-gras.  
30 — Mobile : réglages et aide inaccessibles (bas de barre latérale masqué) ; le logo chevauchait les boutons → bouton Réglages dans la barre du haut (le thème y est), lien « How it works » dans les réglages, logo seul sous 400 px.  
31 — « CURRENT LOCATION » et l'identifiant du monde à 4,4:1 sur le fond teinté de la fiche → gris secondaire plus foncé (conforme AA).  
32 — Avertissements de l'inbox en orange à 3,3:1 (deuxième couleur) → texte principal sur fond neutre.  
33 — Sur un portable de 1280 px, la barre de filtres passait sur deux lignes et sa capsule se déformait → reste sur une seule ligne (recherche à largeur flexible, filtres à largeur fixe).  
34 — Au défilement, le contenu apparaissait au-dessus de la barre d'outils flottante → fondu vers la couleur du fond au-dessus de la barre.  
35 — Étiquettes EN MAJUSCULES (lieu actuel, note privée, vos groupes, réglages, accueil) → casse de phrase, 13 px semi-gras, comme chez Apple.  
36 — Inbox en mode sombre : le filtre sélectionné était une pilule noire → segment en verre clair, comme le reste.  
37 — Palette et menus : élément survolé en bleu sur bleu → fond neutre et texte principal.  
38 — Carte de connexion opaque, hors du style du reste → verre sur le fond ambiant, coins de 36 px, champs de 48 px.  
39 — Interrupteurs en mode sombre : bouton sombre sur rail sombre, l'état « désactivé » était invisible → bouton blanc ombré (style iOS) et rail visible.  
40 — Listes déroulantes des réglages en blocs noirs ou blancs → remplissage neutre translucide.  
41 — Placeholder de recherche coupé à 1280 px → l'indice « / » n'apparaît qu'au-delà de 1440 px (il figure déjà dans la barre latérale).  
42 — Compteurs des onglets et des titres dans de petits carrés gris (bruit visuel) → simples chiffres secondaires.  
43 — Badges d'instance en petits rectangles gris → capsules douces en 12 px.  
44 — Raccourcis clavier de la barre latérale en 11,5 px, illisibles à distance → 13 px, touches en pastilles arrondies.  
45 — Régression du n° 44 : « Ctrl K » se coupait sur deux lignes dans la barre latérale → touches en ligne insécable.  
46 — Régression du n° 35 : « Your space » réapparaissait sur deux lignes dans la barre latérale repliée (tablette) → seules les icônes restent visibles.  
47 — Tablette : la barre de filtres sur deux rangées formait une pilule étirée → panneau aux coins de 28 px.  
48 — Raccourcis de la barre latérale coupés au hasard (« search » seul sur une ligne) → un raccourci par ligne, alignés.  
49 — Confort en VR : grandes surfaces presque blanches, éblouissantes dans un casque → fond et verre légèrement atténués en mode clair.  
50 — Lisibilité à distance : pieds de liste, détails, horodatages et sous-textes encore en 11–12 px → 13 px minimum pour tout texte utile.  
51 — Boutons « sm » (40 px) et liens de sélection (28 px) trop petits pour un pointeur VR → 44 px minimum.  
52 — Initiales des avatars en six couleurs pastel, contraires à la palette sobre → monogrammes gris neutres, comme les contacts Apple.  
53 — Deux boutons primaires bleus « Connect VRChat » visibles en même temps → celui du bandeau devient secondaire (verre) ; un seul bouton primaire à l'écran.  
54 — Régression grave du n° 49, détectée par l'audit : en mode sombre, le verre redevenait clair sous un texte clair (contraste 1,02:1) → l'atténuation est limitée au mode clair.  
55 — Sur le fond clair atténué, textes secondaires et liens tombaient à 4,3–4,5:1 → gris secondaire et accent légèrement plus foncés (conformes AA).  
56 — Vue grille : statuts tronqués (« Join me · Good… ») à cause du bouton « › », inutile puisque toute la carte est cliquable → bouton masqué en grille, statut sur deux lignes.  
57 — Notifications éphémères (toasts) en rectangles gris, hors du style → verre, coins de 22 px, titre et description hiérarchisés.  
58 — Message « groupe enregistré » sur fond vert (deuxième couleur) → fond neutre, texte principal.  
59 — Groupe sélectionné en teinte bleue, différent de la sélection de la barre latérale → même capsule de verre et icône en accent ; liste des membres en panneau arrondi.  
60 — Inbox mobile : la rangée de filtres débordait avec une coupure nette (« Ap… ») → défilement horizontal avec bord estompé ; l'avis « aperçu » devient une carte arrondie au lieu d'une bande grise.  
61 — Page Messages restée plate et opaque, alerte rose → panneaux de verre flottants (coins de 32 px), champs et boutons de 44 px, alerte neutre.  
62 — Recherche de la page Messages en rectangle → capsule, comme toutes les recherches.  
63 — Réglage système « Réduire la transparence » ignoré (inconfortable pour certains) → surfaces pleines et aucun flou quand il est activé.  
64 — Réglage système « Augmenter le contraste » ignoré → contours de verre visibles et texte secondaire renforcé.  
65 — Mobile et casques VR : un flou calculé par carte d'ami rendait le défilement lourd → verre plus dense sans flou individuel, défilement fluide.  
66 — Mode sombre : champs et boutons secondaires des fenêtres en blocs noir pur → remplissage translucide ; boutons secondaires en verre ; survol neutre au lieu de bleu pâle.  
67 — Bouton principal désactivé (« Send boops ») en bleu délavé, qui semblait cliquable → gris neutre, clairement indisponible.  
68 — Cases à cocher de 16 px, petites pour un pointeur VR → cercles de 22 px, et toute la ligne reste cliquable.  
69 — Régression du n° 34 détectée au contrôle final : sur mobile, le fondu de la barre d'outils dépassait de 14 px et créait un défilement horizontal → fondu désactivé sur mobile (la barre n'y est pas collante).  
70 — Connecté, pendant le chargement ou en erreur, les statistiques affichaient « 0 ami en ligne » (faux et inquiétant) → tiret « – » qui pulse doucement tant qu'aucune donnée n'est arrivée.  
71 — Lignes avec bouton « Join » : l'étoile et le chevron étaient comprimés à ~20 px l'un de l'autre (cibles < 44 px) → colonne d'actions élargie à 184 px.  
72 — Fiche d'ami connectée : l'image du monde (très haute) repoussait la note et le bouton favori hors de l'écran → image en 21:9, 170 px max.  
73 — Cartes de lieux : la 4e carte se retrouvait seule sur une 2e ligne en 3 colonnes → masquée tant que « See all » n'est pas ouvert, sauf quand 4 colonnes tiennent.  
74 — Mobile : la pastille de connexion n'était plus qu'un point gris sans texte → masquée quand tout va bien, conservée en cas de problème.  
75 — Erreur de connexion : grands panneaux vides à bordure pointillée empilés → panneaux compacts en verre ; icône d'alerte neutre (pas d'orange).  
76 — 40 boutons « Join » bleus les uns sous les autres, très bruyants → texte en accent sans fond, la teinte n'apparaît qu'au survol de la ligne (toujours visible au tactile).  
77 — « refreshes every 1 min » maladroit → « refreshes every minute ».  
78 — Écran 2560 px : la barre d'outils s'étirait sur toute la largeur alors que le contenu restait centré (boutons à 1 000 px du titre) → barre limitée et alignée sur la colonne de contenu.  
79 — Zoom 200 % / fenêtre de 560–900 px : la barre de filtres refusait de passer à la ligne et débordait de 49 px (défilement horizontal) → recherche pleine largeur, filtres sur la ligne suivante.  
80 — Fiche d'ami : même en 21:9, l'image du monde forçait encore à défiler pour atteindre la note et les favoris → vignette de 120 px ; les noms très longs passent à la ligne au lieu de déborder.  
81 — Régression du n° 78 : sur grand écran, le fondu au-dessus de la barre d'outils formait une bande claire rectangulaire → supprimé quand la barre est centrée.  
82 — Écrans de 2560 px et bureaux virtuels en VR : interface à taille de portable, texte minuscule à distance → toute l'interface est agrandie de 25 % au-delà de 2200 px.  
83 — Grand écran : la barre d'outils dépassait de ~40 px de chaque côté de la colonne de contenu → bords exactement alignés.  
84 — Régression du n° 71, trouvée en testant le mobile avec de vraies données : les nouvelles colonnes écrasaient la mise en page mobile (page de 576 px sur un écran de 390 px) → les cartes mobiles retrouvent une seule colonne.  
85 — Messagerie : sans photo, les avatars affichaient l'icône d'image cassée et le nom en texte débordant → initiales dans un cercle gris, comme sur le tableau de bord.  
86 — En-tête de conversation : « online » en vert et en minuscules → « Online », en texte neutre.  
87 — Bulles de discussion : mes messages en bleu pâle peu distinct, heure en 10 px → mes bulles dans la couleur d'accent avec texte blanc (style iMessage), coins de 22 px, texte en 15 px, heure en 12 px.  
88 — Conversation sélectionnée : bande colorée coupée net au bord du panneau → capsule de verre en retrait, et un survol neutre sur les autres.  
89 — Grille en mode connecté : le bouton « Join » écrasait le nom et le statut (« Hi! I make… ») → les actions passent en bas de la carte, nom et statut prennent toute la largeur.  
90 — Ouvrir une fiche d'ami ou les réglages plaçait le curseur dans le premier champ (note privée, thème) : clavier qui surgit sur mobile, anneau de focus parasite → le focus va sur la fenêtre elle-même, l'accessibilité clavier est conservée.  
91 — Messagerie : le champ de saisie n'avait aucun contour visible (texte d'invite flottant dans le vide) → capsule teintée, texte en 15 px, halo au focus.  
92 — Messagerie sur mobile : la liste et la conversation s'écrasaient côte à côte sur 390 px (conversation coupée, illisible) → un seul panneau à la fois, avec un bouton retour « Back to conversations » dans la conversation.  
93 — Mode sombre : en défilant, les noms de la liste apparaissaient à travers la barre de filtres collante (texte sur texte) → verre plus dense pour cette barre.  
94 — Palette Ctrl+K : « Just B Club » listé trois fois sans distinction (instances différentes) → numéro d'instance et type d'accès affichés à côté.  
95 — Messagerie mobile : le bouton d'envoi était coupé au bord droit de l'écran → le champ se réduit pour que le bouton reste toujours visible.  
96 — Correction insuffisante du n° 93 : en mode sombre, le texte des lignes transparaissait encore sous la barre de filtres → barre quasi opaque en mode sombre.  
97 — Liste des conversations : les noms longs collaient à l'heure (« …_Very_…10:44 PM ») → espace garanti entre les deux.  

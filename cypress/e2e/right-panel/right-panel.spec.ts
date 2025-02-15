/*
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/// <reference types="cypress" />

import { HomeserverInstance } from "../../plugins/utils/homeserver";
import Chainable = Cypress.Chainable;

const ROOM_NAME = "Test room";
const SPACE_NAME = "Test space";
const NAME = "Alice";

const getMemberTileByName = (name: string): Chainable<JQuery<HTMLElement>> => {
    return cy.get(`.mx_EntityTile, [title="${name}"]`);
};

const viewRoomSummaryByName = (name: string): Chainable<JQuery<HTMLElement>> => {
    cy.viewRoomByName(name);
    cy.get(".mx_RightPanel_roomSummaryButton").click();
    return checkRoomSummaryCard(name);
};

const checkRoomSummaryCard = (name: string): Chainable<JQuery<HTMLElement>> => {
    cy.get(".mx_RoomSummaryCard").should("have.length", 1);
    return cy.get(".mx_BaseCard_header").should("contain", name);
};

describe("RightPanel", () => {
    let homeserver: HomeserverInstance;

    beforeEach(() => {
        cy.startHomeserver("default").then((data) => {
            homeserver = data;
            cy.initTestUser(homeserver, NAME).then(() =>
                cy.window({ log: false }).then(() => {
                    cy.createRoom({ name: ROOM_NAME });
                    cy.createSpace({ name: SPACE_NAME });
                }),
            );
        });
    });

    afterEach(() => {
        cy.stopHomeserver(homeserver);
    });

    describe("in rooms", () => {
        it("should handle clicking add widgets", () => {
            viewRoomSummaryByName(ROOM_NAME);

            cy.findByRole("button", { name: "Add widgets, bridges & bots" }).click();
            cy.get(".mx_IntegrationManager").should("have.length", 1);
        });

        it("should handle viewing export chat", () => {
            viewRoomSummaryByName(ROOM_NAME);

            cy.findByRole("button", { name: "Export chat" }).click();
            cy.get(".mx_ExportDialog").should("have.length", 1);
        });

        it("should handle viewing share room", () => {
            viewRoomSummaryByName(ROOM_NAME);

            cy.findByRole("button", { name: "Share room" }).click();
            cy.get(".mx_ShareDialog").should("have.length", 1);
        });

        it("should handle viewing room settings", () => {
            viewRoomSummaryByName(ROOM_NAME);

            cy.findByRole("button", { name: "Room settings" }).click();
            cy.get(".mx_RoomSettingsDialog").should("have.length", 1);
            cy.get(".mx_Dialog_title").within(() => {
                cy.findByText("Room Settings - " + ROOM_NAME).should("exist");
            });
        });

        it("should handle viewing files", () => {
            viewRoomSummaryByName(ROOM_NAME);

            cy.findByRole("button", { name: "Files" }).click();
            cy.get(".mx_FilePanel").should("have.length", 1);
            cy.get(".mx_FilePanel_empty").should("have.length", 1);

            cy.findByRole("button", { name: "Room information" }).click();
            checkRoomSummaryCard(ROOM_NAME);
        });

        it("should handle viewing room member", () => {
            viewRoomSummaryByName(ROOM_NAME);

            // \d represents the number of the room members inside mx_BaseCard_Button_sublabel
            cy.findByRole("button", { name: /People \d/ }).click();
            cy.get(".mx_MemberList").should("have.length", 1);

            getMemberTileByName(NAME).click();
            cy.get(".mx_UserInfo").should("have.length", 1);
            cy.get(".mx_UserInfo_profile").within(() => {
                cy.findByText(NAME);
            });

            cy.findByRole("button", { name: "Room members" }).click();
            cy.get(".mx_MemberList").should("have.length", 1);

            cy.findByRole("button", { name: "Room information" }).click();
            checkRoomSummaryCard(ROOM_NAME);
        });
    });

    describe("in spaces", () => {
        it("should handle viewing space member", () => {
            cy.viewSpaceHomeByName(SPACE_NAME);

            cy.get(".mx_RoomInfoLine_private").within(() => {
                // \d represents the number of the space members
                cy.findByRole("button", { name: /\d member/ }).click();
            });
            cy.get(".mx_MemberList").should("have.length", 1);
            cy.get(".mx_RightPanel_scopeHeader").within(() => {
                cy.findByText(SPACE_NAME);
            });

            getMemberTileByName(NAME).click();
            cy.get(".mx_UserInfo").should("have.length", 1);
            cy.get(".mx_UserInfo_profile").within(() => {
                cy.findByText(NAME);
            });
            cy.get(".mx_RightPanel_scopeHeader").within(() => {
                cy.findByText(SPACE_NAME);
            });

            cy.findByRole("button", { name: "Back" }).click();
            cy.get(".mx_MemberList").should("have.length", 1);
        });
    });
});

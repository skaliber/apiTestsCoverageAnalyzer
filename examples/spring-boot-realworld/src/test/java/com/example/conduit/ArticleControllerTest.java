package com.example.conduit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
public class ArticleControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void listArticles() throws Exception {
        mockMvc.perform(get("/api/articles"))
            .andExpect(status().isOk());
    }

    @Test
    void createArticle() throws Exception {
        mockMvc.perform(post("/api/articles")
            .contentType("application/json")
            .content("{\"title\":\"Test\",\"body\":\"Body\"}"))
            .andExpect(status().isCreated());
    }

    @Test
    void getArticle() throws Exception {
        mockMvc.perform(get("/api/articles/test-slug"))
            .andExpect(status().isOk());
    }

    @Test
    void updateArticle() throws Exception {
        mockMvc.perform(put("/api/articles/test-slug")
            .contentType("application/json")
            .content("{\"title\":\"Updated\"}"))
            .andExpect(status().isOk());
    }

    @Test
    void deleteArticle() throws Exception {
        mockMvc.perform(delete("/api/articles/test-slug"))
            .andExpect(status().isOk());
    }
}
